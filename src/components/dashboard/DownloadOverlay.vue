<template>
  <div class="loading-overlay">
    <div class="loading-card md-elevation-3">
      <div class="progress-circle">
        <md-icon class="spin-icon" v-if="percent < 100">sync</md-icon>
        <md-icon class="success-icon" v-else>check_circle</md-icon>
        <div class="percent-text" v-if="percent < 100">{{ percent }}%</div>
      </div>
      <h3>{{ status }}</h3>
      <div style="width: 100%;" v-if="percent < 100">
        <div class="download-progress-bar"><div class="download-progress-fill" :style="{ width: percent + '%' }"></div></div>
        <div class="stats-board">
          <span>分块: <b>{{ downloadedChunks }} / {{ totalChunks }}</b></span>
          <span>解密: <b style="color: #2E7D32;">{{ decryptedChunks }} / {{ totalChunks }}</b></span>
        </div>
      </div>
      <p class="security-tip"><md-icon style="font-size: 16px; vertical-align: middle;">memory</md-icon> 并发线程根据设备内存动态分配，硬盘流式直写。</p>
      <md-filled-button v-if="percent >= 100" @click="$emit('close')" style="margin-top: 16px; width: 100%;">完成并关闭</md-filled-button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ status: string; percent: number; downloadedChunks: number; decryptedChunks: number; totalChunks: number; }>();
defineEmits(['close']);
</script>

<style scoped>
.loading-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 16px;}
.loading-card { background: var(--md-sys-color-surface); padding: 40px 32px; border-radius: 28px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 450px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
.progress-circle { position: relative; width: 80px; height: 80px; display: flex; justify-content: center; align-items: center; }
.spin-icon { --md-icon-size: 56px; width: 56px; height: 56px; font-size: 56px; line-height: 56px; color: var(--md-sys-color-primary); animation: spin 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; opacity: 0.2; }
.percent-text { position: absolute; font-size: 1.2rem; font-weight: bold; color: var(--md-sys-color-primary); }
.success-icon { --md-icon-size: 64px; width: 64px; height: 64px; font-size: 64px; line-height: 64px; color: #4caf50; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.download-progress-bar { width: 100%; height: 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.download-progress-fill { height: 100%; background: var(--md-sys-color-primary); transition: width 0.1s linear; }
.stats-board { display: flex; justify-content: space-between; width: 100%; margin-top: 12px; font-size: 0.85rem; color: var(--md-sys-color-on-surface); }
.security-tip { background: #E8F5E9; color: #1B5E20; padding: 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 500; text-align: left; line-height: 1.5; margin-top: 8px; }
</style>