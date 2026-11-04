<template>
  <div class="dashboard-root">
    <header class="top-app-bar md-elevation-2">
      <div class="brand"><md-icon>cloud_download</md-icon><h1 class="hide-on-mobile">{{ siteSettings.site_name || '资源下载站' }}</h1></div>
      <div class="actions">
        <md-outlined-button v-if="store.user.isAdmin" @click="router.push('/admin')" class="admin-btn"><md-icon slot="icon">admin_panel_settings</md-icon> <span class="hide-on-mobile">管理控制台</span></md-outlined-button>
        <md-text-button @click="store.logout">退出</md-text-button>
      </div>
    </header>

    <main class="main-content">
      <section class="site-desc md-elevation-1" v-if="currentParentId === 0 && renderedMarkdown"><div class="markdown-body" v-html="renderedMarkdown"></div></section>
      
      <!-- 🌟 异步懒加载：目录专属 Markdown 编辑器 🌟 -->
      <FolderMarkdown v-if="currentParentId !== 0 && (currentFolderMd || store.user.isAdmin)" 
                      :folderMd="currentFolderMd" :isAdmin="store.user.isAdmin" @save="saveFolderMd" />

      <div class="resource-toolbar">
        <div class="breadcrumbs">
          <md-icon-button @click="navigateTo(0, '首页')"><md-icon>home</md-icon></md-icon-button>
          <template v-for="(nav, index) in pathHistory" :key="index">
            <md-icon style="color: gray">chevron_right</md-icon><md-text-button @click="navigateTo(nav.id, nav.name, index)"><span class="truncate-text">{{ nav.name }}</span></md-text-button>
          </template>
        </div>
        
        <div class="toolbar-actions">
          <div class="sort-controls md-elevation-1">
            <md-icon-button @click="cycleSortMode" title="切换排序模式"><md-icon>{{ sortConfig.key === 'default' ? 'sort' : (sortConfig.key === 'name' ? 'sort_by_alpha' : (sortConfig.key === 'size' ? 'format_size' : 'schedule')) }}</md-icon></md-icon-button>
            <span class="sort-label hide-on-mobile">{{ sortLabel }}</span>
            <md-icon-button @click="toggleSortOrder" v-if="sortConfig.key !== 'default'" title="切换升降序"><md-icon>{{ sortConfig.order === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</md-icon></md-icon-button>
          </div>
          <div class="view-toggles md-elevation-1">
            <md-icon-button @click="viewMode = 'card'" :class="{ active: viewMode === 'card' }"><md-icon>grid_view</md-icon></md-icon-button>
            <md-icon-button @click="viewMode = 'list'" :class="{ active: viewMode === 'list' }"><md-icon>view_list</md-icon></md-icon-button>
          </div>
        </div>
      </div>

      <!-- 批量操作控制台 -->
      <transition name="fade">
        <div class="batch-toolbar md-elevation-2" v-if="store.user.isAdmin && selectedIds.length > 0">
          <span style="font-weight: bold;">已选择 {{ selectedIds.length }} 个项目</span><div style="flex-grow: 1;"></div>
          <md-text-button @click="selectedIds = []">取消选择</md-text-button>
          <md-filled-button style="--md-sys-color-primary: #d32f2f;" @click="batchDelete"><md-icon slot="icon">delete</md-icon> 批量删除</md-filled-button>
        </div>
      </transition>

      <div v-if="resources.length > 0">
        <div v-if="store.user.isAdmin" style="margin-bottom: 16px; padding: 0 8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; color:var(--md-sys-color-primary);">
            <input type="checkbox" :checked="selectedIds.length === resources.length" @change="toggleSelectAll" style="width:18px; height:18px;"> 全选本页
          </label>
        </div>

        <div v-if="folders.length > 0" class="category-section">
          <h3 class="category-title"><md-icon>folder</md-icon> 目录</h3>
          <transition-group :name="viewMode === 'card' ? 'list-grid' : 'list-flow'" tag="div" :class="['resource-grid', `view-${viewMode}`]">
            <div class="resource-card md-elevation-1" v-for="res in folders" :key="res.id" :class="{ selected: selectedIds.includes(res.id) }" :draggable="store.user.isAdmin && sortConfig.key === 'default'" @dragstart="onDragStart($event, res)" @dragover.prevent @drop="onDrop($event, res)">
              <input v-if="store.user.isAdmin" type="checkbox" class="card-checkbox" :value="res.id" v-model="selectedIds">
              <div class="icon-wrapper"><md-icon class="fixed-icon">folder</md-icon></div>
              <div class="info"><h4 class="truncate-text" :title="res.name">{{ res.name }}</h4></div>
              <div class="card-actions"><md-filled-button @click="enterFolder(res.id, res.name)">进入</md-filled-button><md-icon-button v-if="store.user.isAdmin" @click="openQuickEdit(res)" style="margin-left: 8px;"><md-icon>edit</md-icon></md-icon-button></div>
            </div>
          </transition-group>
        </div>

        <div v-for="(files, tag) in filesByTag" :key="tag" class="category-section">
          <h3 class="category-title"><md-icon>sell</md-icon> {{ tag }}</h3>
          <transition-group :name="viewMode === 'card' ? 'list-grid' : 'list-flow'" tag="div" :class="['resource-grid', `view-${viewMode}`]">
            <div class="resource-card md-elevation-1" v-for="res in files" :key="res.id" :class="{ selected: selectedIds.includes(res.id) }" :draggable="store.user.isAdmin && sortConfig.key === 'default'" @dragstart="onDragStart($event, res)" @dragover.prevent @drop="onDrop($event, res)">
              <input v-if="store.user.isAdmin" type="checkbox" class="card-checkbox" :value="res.id" v-model="selectedIds">
              <div class="icon-wrapper"><md-icon class="fixed-icon">{{ getMediaIcon(res.name) }}</md-icon></div>
              <div class="info">
                <h4 class="truncate-text" :title="res.name">{{ res.name }}</h4>
                <div class="info-meta">
                  <span v-if="res.is_encrypted" class="security-badge"><md-icon>lock</md-icon> 加密</span>
                  <span v-if="res.file_size" style="font-size:0.8rem; color:gray;">{{ (res.file_size / 1024 / 1024).toFixed(2) }} MB</span>
                </div>
              </div>
              <div class="card-actions">
                <!-- 🌟 智能多媒体识别：自动展示预览按钮 🌟 -->
                <md-outlined-button v-if="isMedia(res.name)" @click="handleMediaPreview(res)"><md-icon slot="icon">play_circle</md-icon> <span class="hide-on-mobile">在线预览</span></md-outlined-button>
                <md-outlined-button v-else @click="handleDownload(res)"><md-icon slot="icon">download</md-icon> <span class="hide-on-mobile">安全下载</span></md-outlined-button>
                <md-icon-button v-if="store.user.isAdmin" @click="openQuickEdit(res)" style="margin-left: 8px;"><md-icon>edit</md-icon></md-icon-button>
              </div>
            </div>
          </transition-group>
        </div>
      </div>
      <div v-else class="empty-state"><md-icon>folder_open</md-icon><p>此目录下空空如也...</p></div>
    </main>

    <!-- 🌟 异步懒加载组件区 🌟 -->
    <DownloadOverlay v-if="isDownloading && !mediaModal.open" :status="downloadStatus" :percent="downloadPercent" :downloadedChunks="downloadedChunksCount" :decryptedChunks="decryptedChunksCount" :totalChunks="totalChunksCount" @close="closeDownloadOverlay" />
    <QuickActionDialog v-if="isDialogNeeded" ref="quickDialogRef" :parentId="currentParentId" @refresh="fetchResources" />
    
    <!-- 智能媒体播放器 -->
    <MediaPlayer v-if="mediaModal.open" :type="mediaModal.type" :url="mediaModal.url" :resource="mediaModal.resource" :isLoading="isDownloading" :statusText="downloadStatus" :percent="downloadPercent" @close="closeMediaModal" @download="downloadFromPreview" />

    <md-fab v-if="store.user.isAdmin" class="admin-fab" @click="openQuickAdd" label="添加资源" size="large"><md-icon slot="icon">add</md-icon></md-fab>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store';
import { importEncryptionKey, decryptApiPayload } from '../utils/crypto';

onMounted(() => { 
  fetchSettings(); 
  fetchResources(); 
  // 🌟 注册虚拟流媒体引擎 🌟
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW 注册失败', err));
  }
});

// 极致切割懒加载
const DownloadOverlay = defineAsyncComponent(() => import('../components/dashboard/DownloadOverlay.vue'));
const QuickActionDialog = defineAsyncComponent(() => import('../components/dashboard/QuickActionDialog.vue'));
const FolderMarkdown = defineAsyncComponent(() => import('../components/dashboard/FolderMarkdown.vue'));
const MediaPlayer = defineAsyncComponent(() => import('../components/dashboard/MediaPlayer.vue'));

const store = useAppStore(); const router = useRouter();
const siteSettings = ref<any>({}); const renderedMarkdown = ref(''); const viewMode = ref('card');
const resources = ref<any[]>([]); const currentParentId = ref(0); const pathHistory = ref<{id: number, name: string}[]>([]);
const currentFolderMd = ref('');
const selectedIds = ref<number[]>([]); 

const isDialogNeeded = ref(false); const quickDialogRef = ref<any>(null);
const isDownloading = ref(false); const downloadStatus = ref(''); const downloadPercent = ref(0); const totalChunksCount = ref(0); const downloadedChunksCount = ref(0); const decryptedChunksCount = ref(0); let countdownTimer: any = null;

// 媒体播放器状态
const mediaModal = ref({ open: false, type: '', url: '', name: '', resource: null as any });

// 排序引擎与分类引擎
const sortConfig = ref({ key: 'default', order: 'asc' }); 
const sortLabel = computed(() => { if (sortConfig.value.key === 'default') return '默认排序 (可拖拽)'; if (sortConfig.value.key === 'name') return '名称排序'; if (sortConfig.value.key === 'size') return '大小排序'; return '时间排序'; });
const cycleSortMode = () => { const modes = ['default', 'name', 'size', 'time']; const currentIndex = modes.indexOf(sortConfig.value.key); sortConfig.value.key = modes[(currentIndex + 1) % modes.length]; sortConfig.value.order = 'asc'; };
const toggleSortOrder = () => { sortConfig.value.order = sortConfig.value.order === 'asc' ? 'desc' : 'asc'; };
const sortData = (arr: any[]) => { return [...arr].sort((a, b) => { let valA, valB; if (sortConfig.value.key === 'default') { valA = a.sort_order || a.id; valB = b.sort_order || b.id; } else if (sortConfig.value.key === 'name') { valA = a.name; valB = b.name; } else if (sortConfig.value.key === 'size') { valA = a.file_size || 0; valB = b.file_size || 0; } else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); } if (valA < valB) return sortConfig.value.order === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.value.order === 'asc' ? 1 : -1; return 0; }); };

const folders = computed(() => sortData(resources.value.filter(r => r.type === 'folder')));
const filesByTag = computed(() => { const groups: Record<string, any[]> = {}; const sortedFiles = sortData(resources.value.filter(r => r.type === 'file')); sortedFiles.forEach(res => { const tags = res.tags ? res.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []; if (tags.length === 0) tags.push('未分类'); tags.forEach((tag: string) => { if (!groups[tag]) groups[tag] = []; groups[tag].push(res); }); }); return groups; });

// 数据拉取
const fetchSettings = async () => { 
  const res = await fetch('/api/settings', { headers: { 'Authorization': `Bearer ${store.user.token}` } }); 
  const data = await res.json(); 
  if (data.success) { 
    siteSettings.value = data.settings; 
    if (data.settings.site_desc) { const MarkdownIt = (await import('markdown-it')).default; const md = new MarkdownIt(); renderedMarkdown.value = md.render(data.settings.site_desc); }
  } 
};

const fetchResources = async () => { 
  const res = await fetch(`/api/admin/resources?parentId=${currentParentId.value}`, { headers: { 'Authorization': `Bearer ${store.user.token}` } }); 
  const data = await res.json(); 
  if (data.success) { 
    resources.value = data.resources.map((r: any) => ({ ...r, sort_order: r.sort_order || r.id })); 
    currentFolderMd.value = data.folder_md; // 读取目录级 Markdown
    selectedIds.value = []; // 切换目录清空选择
  } 
};

const enterFolder = (id: number, name: string) => { pathHistory.value.push({ id, name }); currentParentId.value = id; fetchResources(); };
const navigateTo = (id: number, _name: string, index: number = -1) => { currentParentId.value = id; pathHistory.value = index === -1 ? [] : pathHistory.value.slice(0, index + 1); fetchResources(); };

// Markdown 编辑保存
const saveFolderMd = async (content: string) => {
  try {
    await fetch(`/api/admin/resources/${currentParentId.value}/folder-desc`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.user.token}` },
      body: JSON.stringify({ folder_md: content })
    });
    currentFolderMd.value = content; store.showAlert('成功', '目录描述已保存');
  } catch(e) { store.showAlert('错误', '保存失败'); }
};

// 拖拽
const dragItem = ref<any>(null);
const onDragStart = (e: DragEvent, res: any) => { if (!store.user.isAdmin || sortConfig.value.key !== 'default') return; dragItem.value = res; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; };
const onDrop = async (_e: DragEvent, targetRes: any) => {
  if (!store.user.isAdmin || sortConfig.value.key !== 'default' || !dragItem.value || dragItem.value.id === targetRes.id) return;
  const draggedOrder = dragItem.value.sort_order || dragItem.value.id; const targetOrder = targetRes.sort_order || targetRes.id;
  const draggedIndex = resources.value.findIndex(r => r.id === dragItem.value.id); const targetIndex = resources.value.findIndex(r => r.id === targetRes.id);
  resources.value[draggedIndex].sort_order = targetOrder; resources.value[targetIndex].sort_order = draggedOrder; resources.value = [...resources.value];
  const updates = [ { id: dragItem.value.id, sort_order: targetOrder }, { id: targetRes.id, sort_order: draggedOrder } ]; dragItem.value = null;
  try { await fetch('/api/admin/resources/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.user.token}` }, body: JSON.stringify({ updates }) }); } catch (_err) { store.showAlert("错误", "排序保存失败"); fetchResources(); }
};

// 批量操作
const toggleSelectAll = (e: any) => { if (e.target.checked) selectedIds.value = resources.value.map(r => r.id); else selectedIds.value = []; };
const batchDelete = async () => {
  if (!confirm(`确定要彻底销毁这 ${selectedIds.value.length} 个资源及其云端碎片吗？`)) return;
  try {
    const res = await fetch('/api/admin/resources/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.user.token}` }, body: JSON.stringify({ ids: selectedIds.value }) });
    const data = await res.json(); if (!data.success) throw new Error(data.message);
    selectedIds.value = []; fetchResources(); store.showAlert('清理完毕', data.message);
  } catch (e: any) { store.showAlert("批量删除失败", e.message); }
};

// 🌟 媒体探测与串流引擎 🌟
const isMedia = (name: string) => /\.(mp4|mkv|webm|mp3|wav|flac|aac|ogg|jpg|jpeg|png|gif|webp)$/i.test(name);
const getMediaType = (name: string) => { if (/\.(mp4|mkv|webm)$/i.test(name)) return 'video'; if (/\.(mp3|wav|flac|aac|ogg)$/i.test(name)) return 'audio'; return 'image'; };
const getMediaIcon = (name: string) => { if (/\.(mp4|mkv|webm)$/i.test(name)) return 'movie'; if (/\.(mp3|wav|flac|aac|ogg)$/i.test(name)) return 'audio_file'; if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return 'image'; if (/\.(zip|7z|rar|gz)$/i.test(name)) return 'folder_zip'; return 'description'; };

const closeMediaModal = () => { mediaModal.value.open = false; if (mediaModal.value.url) window.URL.revokeObjectURL(mediaModal.value.url); mediaModal.value.url = ''; closeDownloadOverlay(); };
// 🌟 极速流媒体调度引擎 🌟
const handleMediaPreview = async (resource: any) => {
  try {
    const token = store.user.token;
    const res = await fetch(`/api/resources/${resource.id}/download`, { headers: { 'Authorization': `Bearer ${token}` } });
    const rawData = await res.json();
    const data = rawData.e2ee ? await decryptApiPayload(rawData, token) : rawData;

    if (!data.success) throw new Error(data.message);

    if (data.isLink || !data.is_encrypted) {
      // 未加密文件直接给播放器
      mediaModal.value = { open: true, type: getMediaType(resource.name), url: data.downloadUrl || data.downloadUrls[0], name: resource.name, resource };
      return;
    }

    // 🌟 加密文件：把凭证发给 Service Worker，然后生成虚拟串流 URL！
    const streamId = `vid_${Date.now()}`;
    const manifest = {
      file_size: resource.file_size,
      chunk_size: 10 * 1024 * 1024,
      urls: data.downloadUrls,
      encrypt_key: data.encrypt_key,
      mime_type: getMediaMimeType(data.file_name)
    };

    const sw = navigator.serviceWorker.controller;
    if (!sw) throw new Error("浏览器的 Service Worker 尚未就绪，请刷新页面重试。");

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data.success) {
        // SW 接收凭证成功，把虚拟的流媒体地址喂给 XGPlayer，瞬间开始边下边播！
        mediaModal.value = { open: true, type: getMediaType(resource.name), url: `/e2ee-stream/${streamId}`, name: resource.name, resource };
      }
    };

    sw.postMessage({ type: 'REGISTER_STREAM', id: streamId, manifest }, [channel.port2]);

  } catch (e: any) {
    store.showAlert("串流异常", e.message);
  }
};
const downloadFromPreview = () => { if (!mediaModal.value.url) return; const a = document.createElement('a'); a.href = mediaModal.value.url; a.download = mediaModal.value.name; document.body.appendChild(a); a.click(); a.remove(); };

// 下载基础控制
const closeDownloadOverlay = () => { isDownloading.value = false; if (countdownTimer) clearInterval(countdownTimer); };
const startSuccessCountdown = () => { let seconds = 10; downloadStatus.value = `✅ 文件已安全保存到本地 (${seconds}s)`; countdownTimer = setInterval(() => { seconds--; if (seconds > 0) { downloadStatus.value = `✅ 文件已安全保存到本地 (${seconds}s)`; } else { closeDownloadOverlay(); } }, 1000); };

// 并发流水线核心 (合并了串流缓冲与直接落盘)
const executeDownloadPipeline = async (resource: any, isPreview: boolean = false) => {
  try {
    const token = store.user.token;
    const res = await fetch(`/api/resources/${resource.id}/download`, { headers: { 'Authorization': `Bearer ${token}` } });
    const rawData = await res.json();
    const data = rawData.e2ee ? await decryptApiPayload(rawData, token) : rawData;

    if (!data.success) throw new Error(data.message);
    if (data.isLink || !data.is_encrypted) { window.open(data.downloadUrl || data.downloadUrls[0], '_blank'); return; }

    let fileHandle: any = null; let writable: any = null;
    if (!isPreview && 'showSaveFilePicker' in window) {
      try { fileHandle = await (window as any).showSaveFilePicker({ suggestedName: data.file_name }); if (fileHandle) writable = await fileHandle.createWritable(); } 
      catch (err: any) { if (err.name === 'AbortError') return; }
    }

    isDownloading.value = true; downloadPercent.value = 0; downloadedChunksCount.value = 0; decryptedChunksCount.value = 0; totalChunksCount.value = data.total_chunks || 1;
    downloadStatus.value = '☁️ 并发管线建立中...';

    const CHUNK_SIZE = 10 * 1024 * 1024; const urls = data.downloadUrls; const key = await importEncryptionKey(data.encrypt_key);
    const totalEncryptedBytes = resource.file_size + (totalChunksCount.value * 28);
    const chunksLoadedBytes = new Array(totalChunksCount.value).fill(0); const fallbackChunks = new Array(totalChunksCount.value); 
    const concurrency = Math.min(6, navigator.hardwareConcurrency || 4); let nextChunkIndex = 0;

    const downloadWorker = async () => {
      while (true) {
        const i = nextChunkIndex++; if (i >= totalChunksCount.value) break;
        const chunkRes = await fetch(urls[i]); if (!chunkRes.ok) throw new Error(`碎片 ${i} 拉取失败`);
        const reader = chunkRes.body!.getReader(); const chunks = []; let loaded = 0;

        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          chunks.push(value); loaded += value.length; chunksLoadedBytes[i] = loaded;
          const globalLoaded = chunksLoadedBytes.reduce((a, b) => a + b, 0);
          downloadPercent.value = Math.min(99, Math.round((globalLoaded / totalEncryptedBytes) * 100));
          downloadStatus.value = `⚡ ${isPreview ? '流式缓冲' : '并发拉取'}中...`;
        }
        downloadedChunksCount.value++;

        const combinedBuffer = new Uint8Array(loaded); let offsetArr = 0;
        for (const c of chunks) { combinedBuffer.set(c, offsetArr); offsetArr += c.length; }
        const iv = combinedBuffer.slice(0, 12); const cipherBuffer = combinedBuffer.slice(12);
        const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuffer);
        decryptedChunksCount.value++;

        if (writable) { await writable.write({ type: 'write', position: i * CHUNK_SIZE, data: decryptedBuffer }); } 
        else { fallbackChunks[i] = decryptedBuffer; } // 手机或串流模式强制走内存数组
      }
    };

    const workers = []; for(let w = 0; w < Math.min(concurrency, totalChunksCount.value); w++) { workers.push(downloadWorker()); }
    await Promise.all(workers);

    downloadStatus.value = '💾 刷新数据流...';
    if (writable) { 
      await writable.close(); downloadPercent.value = 100; downloadStatus.value = '✅ 完美落盘！'; startSuccessCountdown(); 
    } else { 
      // 🌟 根据模式区分是生成可播放 Blob 还是普通下载 Blob 🌟
      const mimeType = isPreview ? getMediaMimeType(data.file_name) : 'application/octet-stream';
      const finalBlob = new Blob(fallbackChunks, { type: mimeType }); 
      
      if (isPreview) {
        mediaModal.value.url = window.URL.createObjectURL(finalBlob);
        isDownloading.value = false; // 隐藏加载，把舞台交给播放器！
      } else {
        triggerBrowserDownload(finalBlob, data.file_name); downloadPercent.value = 100; downloadStatus.value = '✅ 完美落盘！'; startSuccessCountdown(); 
      }
    }
  } catch (e: any) { store.showAlert(isPreview ? "串流异常" : "下载异常", e.message); isDownloading.value = false; }
};

const getMediaMimeType = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = { 'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg', 'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'jpg': 'image/jpeg', 'png': 'image/png' };
  return mimeMap[ext!] || 'application/octet-stream';
};

const handleDownload = (resource: any) => executeDownloadPipeline(resource, false);

// 快捷弹窗呼出逻辑
const openQuickAdd = async () => { isDialogNeeded.value = true; await nextTick(); quickDialogRef.value?.openAdd(); };
const openQuickEdit = async (item: any) => { isDialogNeeded.value = true; await nextTick(); quickDialogRef.value?.openEdit(item); };

onMounted(() => { fetchSettings(); fetchResources(); });
// 🌟 补齐缺失的浏览器本地下载唤起函数 🌟
const triggerBrowserDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
</script>

<style scoped>
/* 保持原有基础 CSS 样式不变 */
.dashboard-root { min-height: 100vh; background-color: var(--md-sys-color-background); overflow-x: hidden; }
.top-app-bar { display: flex; justify-content: space-between; align-items: center; padding: 0 24px; padding-right: 80px; height: 64px; background-color: var(--md-sys-color-surface); position: sticky; top: 0; z-index: 10; }
.brand { display: flex; align-items: center; gap: 12px; color: var(--md-sys-color-primary); }
.brand h1 { font-size: 1.5rem; margin: 0; color: var(--md-sys-color-on-surface); white-space: nowrap; }
.actions { display: flex; gap: 8px; align-items: center; }
.main-content { max-width: 1200px; margin: 0 auto; padding: 32px 24px; transition: padding 0.3s ease; }
@media (max-width: 768px) { .top-app-bar { padding-right: 60px; padding-left: 12px; } .hide-on-mobile { display: none !important; } .main-content { padding: 16px 12px; } .toolbar-actions { flex-direction: column; align-items: flex-end; gap: 8px; } .resource-card { padding: 16px; gap: 12px; } }

.site-desc { background: var(--md-sys-color-surface); padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid var(--md-sys-color-outline); }
.markdown-body { color: var(--md-sys-color-on-surface); font-size: 1.05rem; line-height: 1.6; }
.resource-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--md-sys-color-surface); padding: 8px 16px; border-radius: 16px; flex-wrap: wrap; gap: 12px;}
.breadcrumbs { display: flex; align-items: center; gap: 4px; overflow-x: auto; flex-grow: 1; }
.toolbar-actions { display: flex; gap: 12px; align-items: center; }
.sort-controls, .view-toggles { display: flex; align-items: center; gap: 4px; background: var(--md-sys-color-background); padding: 4px; border-radius: 24px; }
.sort-label { font-size: 0.9rem; font-weight: bold; color: var(--md-sys-color-on-surface); padding: 0 8px; }
.view-toggles .active { color: var(--md-sys-color-primary); background: var(--md-sys-color-surface-variant); border-radius: 50%; }
.category-section { margin-bottom: 32px; }
.category-title { display: flex; align-items: center; gap: 8px; font-size: 1.3rem; margin-bottom: 16px; color: var(--md-sys-color-on-background); padding-bottom: 8px; border-bottom: 1px solid var(--md-sys-color-outline);}
.category-title md-icon { color: var(--md-sys-color-primary); }

.resource-grid { display: grid; gap: 20px; position: relative; }
.view-card { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.view-list { grid-template-columns: 1fr; }
.list-grid-move, .list-flow-move, .list-grid-enter-active, .list-grid-leave-active, .list-flow-enter-active, .list-flow-leave-active { transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1); }
.list-grid-enter-from, .list-grid-leave-to, .list-flow-enter-from, .list-flow-leave-to { opacity: 0; transform: scale(0.9) translateY(20px); }
.list-grid-leave-active, .list-flow-leave-active { position: absolute; }

.resource-card { background: var(--md-sys-color-surface); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s; cursor: grab; }
.resource-card:active { cursor: grabbing; box-shadow: 0 12px 24px rgba(0,0,0,0.15); z-index: 2;}
.resource-card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
.view-list .resource-card { flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 20px; }

.fixed-icon { --md-icon-size: 40px; width: 40px; height: 40px; font-size: 40px; line-height: 40px; color: var(--md-sys-color-primary); flex-shrink: 0; }
.info { flex-grow: 1; min-width: 0; }
.truncate-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;}
.info h4 { margin: 0 0 8px; font-size: 1.1rem; }
.info-meta { display:flex; gap: 8px; align-items:center; flex-wrap: wrap; }
.security-badge { background: #E8F5E9; color: #2E7D32; padding: 4px 8px; border-radius: 8px; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px; }
.security-badge md-icon { font-size: 14px; }
.card-actions { display: flex; align-items: center; flex-shrink: 0; }
.empty-state { text-align: center; padding: 60px; color: var(--md-sys-color-outline); }
.empty-state md-icon { font-size: 64px; opacity: 0.5; }
.admin-fab { position: fixed; bottom: 32px; right: 32px; z-index: 100; transition: transform 0.3s; }

/* 🌟 批量工具栏 🌟 */
.batch-toolbar { position: sticky; top: 76px; z-index: 9; display: flex; align-items: center; gap: 16px; padding: 12px 24px; background: #e3f2fd; color: #0d47a1; border-radius: 12px; margin-bottom: 24px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-10px); }
.card-checkbox { position: absolute; top: 16px; left: 16px; width: 20px; height: 20px; z-index: 2; cursor: pointer; accent-color: var(--md-sys-color-primary); }
.resource-card.selected { border: 2px solid var(--md-sys-color-primary); background-color: var(--md-sys-color-primary-container); }
.view-list .card-checkbox { position: relative; top: 0; left: 0; margin-right: 16px; }
</style>