<template>
  <div :style="themeStyles" :class="{ 'dark-mode': store.isDark }" class="app-root">
    
    <!-- 优化版：可伸缩的主题胶囊 -->
    <div class="theme-capsule md-elevation-3" :class="{ expanded: isThemeOpen }">
      <!-- 触发按钮 -->
      <md-icon-button @click="isThemeOpen = !isThemeOpen" class="trigger-btn">
        <md-icon>{{ isThemeOpen ? 'close' : 'palette' }}</md-icon>
      </md-icon-button>
      
      <!-- 展开的内容区 -->
      <div class="theme-options" :class="{ visible: isThemeOpen }">
        <md-icon-button @click="store.toggleDarkMode">
          <md-icon>{{ store.isDark ? 'light_mode' : 'dark_mode' }}</md-icon>
        </md-icon-button>
        <div class="divider"></div>
        <div class="color-palette">
          <div v-for="(color, index) in THEME_COLORS" :key="index" 
               class="color-dot" :class="{ active: store.themeIndex === index }"
               :style="{ backgroundColor: `hsl(${color.hue}, 80%, 50%)` }"
               @click="store.setTheme(index)">
          </div>
        </div>
      </div>
    </div>

    <!-- 路由视图与全局路由切换动画 -->
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- MD3 全局弹窗 -->
    <md-dialog :open="store.dialog.open" @closed="store.closeAlert">
      <div slot="headline">{{ store.dialog.title }}</div>
      <div slot="content">{{ store.dialog.message }}</div>
      <div slot="actions"><md-filled-button @click="store.closeAlert">好的</md-filled-button></div>
    </md-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore, THEME_COLORS } from './store';

const store = useAppStore();
const isThemeOpen = ref(false); // 控制胶囊展开状态

const themeStyles = computed(() => {
  const hue = THEME_COLORS[store.themeIndex].hue;
  return {
    '--md-sys-color-primary': `hsl(${hue}, 80%, 40%)`,
    '--md-sys-color-on-primary': `#ffffff`,
    '--md-sys-color-primary-container': `hsl(${hue}, 70%, 90%)`,
    '--md-sys-color-on-primary-container': `hsl(${hue}, 90%, 15%)`,
    '--md-sys-color-secondary-container': `hsl(${hue}, 30%, 90%)`,
    '--md-sys-color-on-secondary-container': `hsl(${hue}, 30%, 10%)`,
    
    '--md-sys-color-background': store.isDark ? '#1a1c1e' : '#fdfcff',
    '--md-sys-color-on-background': store.isDark ? '#e2e2e6' : '#1a1c1e',
    '--md-sys-color-surface': store.isDark ? '#1E1E22' : '#ffffff',
    '--md-sys-color-on-surface': store.isDark ? '#e2e2e6' : '#1a1c1e',
    '--md-sys-color-surface-variant': store.isDark ? '#44474e' : '#e1e2e8',
    '--md-sys-color-outline': store.isDark ? '#8d9199' : '#73777f',
  };
});
</script>

<style>
/* 基础重置 */
body { margin: 0; padding: 0; background-color: var(--md-sys-color-background); color: var(--md-sys-color-on-background); transition: background-color 0.3s ease, color 0.3s ease; }
.app-root { min-height: 100vh; position: relative; }

/* ======== 可伸缩主题胶囊 ======== */
.theme-capsule {
  position: fixed; top: 16px; right: 16px; z-index: 9999;
  background: var(--md-sys-color-surface);
  border-radius: 50px; padding: 4px;
  display: flex; align-items: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  /* 核心动画：基于 max-width 实现丝滑展开 */
  max-width: 48px; height: 48px; box-sizing: border-box;
  overflow: hidden; white-space: nowrap;
  transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
  border: 1px solid var(--md-sys-color-outline);
}
.theme-capsule.expanded { max-width: 400px; padding-right: 16px; border-color: var(--md-sys-color-primary); }

.trigger-btn { transition: transform 0.3s ease; flex-shrink: 0; }
.theme-capsule.expanded .trigger-btn { transform: rotate(90deg); }

.theme-options {
  display: flex; align-items: center; gap: 12px;
  opacity: 0; transform: translateX(20px);
  transition: all 0.3s ease;
}
.theme-options.visible { opacity: 1; transform: translateX(0); margin-left: 8px; }

.divider { width: 1px; height: 24px; background: var(--md-sys-color-outline); opacity: 0.5; }
.color-palette { display: flex; gap: 8px; }
.color-dot { 
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer; 
  transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
.color-dot:hover { transform: scale(1.1); }
.color-dot.active { transform: scale(1.2); border: 2px solid var(--md-sys-color-on-surface); }

/* ======== 页面路由丝滑切换动画 ======== */
.page-fade-enter-active, .page-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(15px); }
.page-fade-leave-to { opacity: 0; transform: translateY(-15px); }

/* 对话框圆角适配 */
md-dialog { --md-dialog-container-shape: 28px; --md-dialog-container-color: var(--md-sys-color-surface); }
</style>