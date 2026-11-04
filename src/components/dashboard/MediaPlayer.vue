<template>
  <!-- 🌟 升级：磨砂背景完美接入 MD3 主题色混合系统 🌟 -->
  <div class="media-overlay">
    <!-- 头部工具栏 (高度适配) -->
    <div class="media-header">
      <span style="color: var(--md-sys-color-on-background); font-weight:bold; font-size: 1.25rem;" class="truncate-text">{{ resource.name }}</span>
      <div style="display:flex; gap:16px; align-items: center;">
        <md-icon-button style="color: var(--md-sys-color-primary);" @click="$emit('download')" title="下载原文件"><md-icon>download</md-icon></md-icon-button>
        <md-icon-button style="color: var(--md-sys-color-primary);" @click="closePlayer"><md-icon>close</md-icon></md-icon-button>
      </div>
    </div>
    
    <div class="media-content">
      <!-- 🌟 极致自适应：太空舱一体化剧场 🌟 -->
      <div class="theater-core">
        <!-- XGPlayer 容器 (移除了硬圆角，融合到太空舱内部) -->
        <div class="player-wrapper" v-show="!codecError">
          <div id="mse" style="width: 100%; height: 100%; background: #000;"></div>
        </div>

        <!-- 🌟 极高颜值 MD3 弹幕发射台 🌟 -->
        <div class="danmu-launcher" v-if="!codecError && (type === 'video' || type === 'audio')">
          <!-- 弹幕输入框 (MD3 药丸圆角) -->
          <md-outlined-text-field 
            class="danmu-input" 
            label="来发一发弹幕保护作者吧..." 
            :value="danmuText" 
            @input="danmuText = $event.target.value"
            @keyup.enter="sendCustomDanmu">
            <md-icon slot="leading-icon">chat</md-icon>
          </md-outlined-text-field>

          <!-- 弹幕属性工具箱 -->
          <div class="launcher-toolbox">
            <!-- 弹幕轨道选择 (MD3 胶囊化) -->
            <select v-model="danmuMode" class="modern-select-mini">
              <option value="scroll">滚动弹幕</option>
              <option value="top">顶部固定</option>
              <option value="bottom">底部固定</option>
            </select>

            <!-- 弹幕尺寸选择 (MD3 胶囊化) -->
            <select v-model="danmuSize" class="modern-select-mini">
              <option value="16px">标准小字</option>
              <option value="22px">华丽中字</option>
              <option value="28px">极客大字</option>
            </select>

            <!-- 动态缩放调色盘 -->
            <div class="color-palette">
              <div v-for="c in DANMU_COLORS" :key="c" 
                   class="color-dot" :class="{ active: selectedColor === c }"
                   :style="{ backgroundColor: c }" @click="selectedColor = c">
              </div>
            </div>

            <!-- 发送按钮 -->
            <md-filled-button @click="sendCustomDanmu" class="send-btn">
              <md-icon slot="icon">send</md-icon> 发送
            </md-filled-button>
          </div>
        </div>
      </div>
      
      <div v-if="codecError" class="codec-error-card md-elevation-3">
        <md-icon style="font-size: 64px; color: #ff5252;">movie_filter</md-icon>
        <h3 style="color: white; margin: 16px 0 8px;">设备硬件解码器不支持</h3>
        <p style="color: #ccc;">此格式超出了浏览器支持范围，请安全下载至本地使用 PotPlayer 观看。</p>
        <md-filled-button @click="$emit('download')" style="margin-top: 24px;">安全下载</md-filled-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import Player from 'xgplayer';
import 'xgplayer/dist/index.min.css';
import Danmu from 'xgplayer/es/plugins/danmu';
import 'xgplayer/es/plugins/danmu/index.css';

const props = defineProps<{ type: string; url: string; resource: any; }>();
const emit = defineEmits(['close', 'download']);

let playerInstance: any = null;
const codecError = ref(false);

const DANMU_COLORS = ['#ffffff', '#FF1744', '#00E676', '#29B6F6', '#FFD600', '#E040FB', '#00E5FF'];
const danmuText = ref('');
const selectedColor = ref('#ffffff');
const danmuMode = ref<'scroll' | 'top' | 'bottom'>('scroll');
const danmuSize = ref('22px');

const subInputRef = ref<HTMLInputElement | null>(null);
const customSubtitles = ref<{ url: string; name: string; lang: string }[]>([]);

let wsClient: WebSocket | null = null;

const fetchDanmaku = async () => {
  try {
    const res = await fetch(`/api/resources/${props.resource.id}/danmaku`);
    const data = await res.json();
    return data.success ? data.comments : [];
  } catch (e) { return []; }
};

const sendDanmaku = async (danmu: any) => {
  try {
    await fetch(`/api/resources/${props.resource.id}/danmaku`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: danmu.start,
        txt: danmu.txt,
        color: danmu.style?.color || '#ffffff',
        font_size: danmu.style?.fontSize || '20px',
        mode: danmu.mode || 'scroll'
      })
    });
  } catch (e) {}
};

const closePlayer = () => {
  if (wsClient) wsClient.close();
  emit('close');
};

const initPlayer = async () => {
  if (playerInstance || !props.url) return;
  try {
    const comments = await fetchDanmaku();

    playerInstance = new Player({
      id: 'mse', url: props.url,
      videoInit: true, autoplay: true,
      playbackRate: [0.5, 1, 1.25, 1.5, 2, 3],
      plugins: [Danmu],
      // 🌟 核心：开启 fluid 响应式缩放，完美自适应浏览器和视口 🌟
      fluid: true,
      fitVideoSize: 'fixWidth',
      danmu: {
        comments,
        area: { start: 0, end: 1 },
        defaultOpen: true,
        panel: true,
        sendAction: (danmu: any) => { sendDanmaku(danmu); }
      }
    });

    playerInstance.on('error', () => { codecError.value = true; });

    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    wsClient = new WebSocket(`${wsProto}://${window.location.host}`);
    
    wsClient.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'danmaku_receive' && parsed.resourceId === props.resource.id && playerInstance) {
          playerInstance.danmu.sendComment(parsed.comment);
        }
      } catch(e) {}
    };

  } catch (e) { codecError.value = true; }
};

const sendCustomDanmu = async () => {
  if (!danmuText.value.trim() || !playerInstance) return;

  const currentMs = Math.round(playerInstance.currentTime * 1000);
  
  const newComment = {
    id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    duration: 5000,
    start: currentMs,
    txt: danmuText.value,
    mode: danmuMode.value,
    style: {
      color: selectedColor.value,
      fontSize: danmuSize.value,
      textShadow: '1px 1px 2px #000000, 2px 2px 4px rgba(0,0,0,0.5)'
    }
  };

  playerInstance.danmu.sendComment(newComment);

  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({
      type: 'danmaku_send',
      resourceId: props.resource.id,
      comment: newComment
    }));
  }

  await sendDanmaku(newComment);
  danmuText.value = '';
};

const triggerSubtitleUpload = () => { subInputRef.value?.click(); };
const handleSubtitleLoad = async (event: any) => {
  const file = event.target.files[0];
  if (!file || !playerInstance) return;

  const text = await file.text();
  let vttText = text;

  if (file.name.endsWith('.srt')) {
    vttText = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }

  const vttBlob = new Blob([vttText], { type: 'text/vtt' });
  const vttUrl = URL.createObjectURL(vttBlob);

  customSubtitles.value.push({ url: vttUrl, name: file.name, lang: `sub-${customSubtitles.value.length}` });

  await nextTick();
  if (playerInstance) {
    const currentTime = playerInstance.currentTime;
    const isPlaying = playerInstance.playing;
    playerInstance.destroy();
    playerInstance = null;
    await initPlayer();
    setTimeout(() => {
      if (playerInstance) {
        playerInstance.currentTime = currentTime;
        if (isPlaying) playerInstance.play();
        playerInstance.danmu.show(); 
      }
    }, 100);
  }
};

watch(() => props.url, (newUrl) => { if (newUrl) initPlayer(); });
onMounted(() => { if (props.url) initPlayer(); });
onUnmounted(() => { 
  if (wsClient) wsClient.close();
  if (playerInstance) { playerInstance.destroy(); playerInstance = null; } 
  customSubtitles.value.forEach(sub => URL.revokeObjectURL(sub.url));
});

void triggerSubtitleUpload;
void handleSubtitleLoad;
</script>

<style scoped>
/* 🌟 全新毛玻璃背景：接入系统 MD3 主题色，实现自适应变色 🌟 */
.media-overlay { 
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
  background-color: color-mix(in srgb, var(--md-sys-color-background) 85%, transparent);
  backdrop-filter: blur(25px); 
  z-index: 10000; display: flex; flex-direction: column; 
  transition: background-color 0.3s ease;
}
.media-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; }
.media-content { flex-grow: 1; display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden; padding: 24px; }

/* 🌟 极致响应式：太空舱一体化剧场面板 🌟 */
.theater-core {
  width: 95%; max-width: 1000px;
  height: 85vh; max-height: 750px;
  display: flex; flex-direction: column; gap: 0; /* 缝隙归零，完全合体 */
  border-radius: 24px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  background-color: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline);
}
.player-wrapper { width: 100%; flex-grow: 1; min-height: 0; background: #000; overflow: hidden; }

/* 🌟 抖音同款：将西瓜播放器的主题颜色，100% 改造为你系统选择的 MD3 动态主色 🌟 */
:deep(.xgplayer) {
  font-family: 'Google Sans', sans-serif !important;
  --xgplayer-theme-color: var(--md-sys-color-primary) !important;
  --xgplayer-custom-color: var(--md-sys-color-primary) !important;
}
:deep(.xgplayer-progress-played), :deep(.xgplayer-volume-active), :deep(.xgplayer-drag-dot) {
  background: var(--md-sys-color-primary) !important;
}

/* 🌟 MD3 极高颜值弹幕发射台 (完美融入主色) 🌟 */
.danmu-launcher {
  background-color: var(--md-sys-color-surface);
  padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
  border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent);
}
.danmu-input { width: 100%; --md-outlined-text-field-container-shape: 16px; }

.launcher-toolbox { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

/* 🌟 MD3 胶囊形状选择器 🌟 */
.modern-select-mini {
  padding: 8px 16px; border-radius: 20px;
  border: 1px solid var(--md-sys-color-outline);
  background: var(--md-sys-color-surface-variant);
  color: var(--md-sys-color-on-surface);
  font-size: 0.85rem; font-weight: bold; outline: none; cursor: pointer;
  transition: all 0.2s ease;
}
.modern-select-mini:hover { background-color: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }

/* 动态缩放调色盘 */
.color-palette { display: flex; gap: 8px; }
.color-dot { 
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer; 
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid var(--md-sys-color-surface);
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { 
  transform: scale(1.3); 
  border-color: var(--md-sys-color-on-surface);
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.send-btn { --md-filled-button-container-shape: 20px; }

/* 🌟 移动端 (手机/平板) 专属全屏剧场自适应 🌟 */
@media (max-width: 768px) {
  .media-content { padding: 0; }
  .theater-core {
    width: 100%; height: calc(100vh - 64px); max-height: 100%;
    border-radius: 0; border: none;
  }
  .danmu-launcher { padding: 12px; border-radius: 0; gap: 12px; }
  .launcher-toolbox { gap: 8px; }
  .color-palette { gap: 6px; }
  .color-dot { width: 18px; height: 20px; }
}

.media-image { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
.codec-error-card { display: flex; flex-direction: column; align-items: center; text-align: center; background: #1e1e1e; padding: 40px; border-radius: 24px; border: 1px solid #333; }
.truncate-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 60vw; }
</style>