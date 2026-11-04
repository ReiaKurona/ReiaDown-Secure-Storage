<template>
  <div class="admin-layout">
    <aside class="sidebar md-elevation-1">
      <div class="brand"><md-icon>admin_panel_settings</md-icon><h2 class="nav-text">控制台</h2></div>
      <nav class="nav-menu">
        <div class="nav-item" :class="{ active: currentTab === 'resources' }" @click="currentTab = 'resources'"><md-icon>source</md-icon> <span class="nav-text">资源管理</span></div>
        <div class="nav-item" :class="{ active: currentTab === 'oss' }" @click="currentTab = 'oss'"><md-icon>cloud_sync</md-icon> <span class="nav-text">OSS 配置</span></div>
        <div class="nav-item" :class="{ active: currentTab === 'github' }" @click="currentTab = 'github'"><md-icon>sync</md-icon> <span class="nav-text">GitHub 同步</span></div>
        <div class="nav-item" :class="{ active: currentTab === 'users' }" @click="currentTab = 'users'"><md-icon>people</md-icon> <span class="nav-text">查看用户</span></div>
        <div class="nav-item" :class="{ active: currentTab === 'settings' }" @click="currentTab = 'settings'"><md-icon>settings</md-icon> <span class="nav-text">系统设置</span></div>
      </nav>
      <div class="bottom-action"><md-text-button @click="$router.push('/dashboard')"><md-icon slot="icon">arrow_back</md-icon> <span class="nav-text">返回前台</span></md-text-button></div>
    </aside>

    <main class="content-area">
      <transition name="panel-fade" mode="out-in">
        <component :is="activeComponent"></component>
      </transition>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';

// 🌟 终极拆包：将 5 个后台面板全部改为“按需异步懒加载” 🌟
const ResourcePanel = defineAsyncComponent(() => import('../components/admin/ResourcePanel.vue'));
const OssPanel = defineAsyncComponent(() => import('../components/admin/OssPanel.vue'));
const GithubPanel = defineAsyncComponent(() => import('../components/admin/GithubPanel.vue'));
const UsersPanel = defineAsyncComponent(() => import('../components/admin/UsersPanel.vue'));
const SettingsPanel = defineAsyncComponent(() => import('../components/admin/SettingsPanel.vue'));

const currentTab = ref('resources');

const activeComponent = computed(() => {
  switch (currentTab.value) {
    case 'resources': return ResourcePanel;
    case 'oss': return OssPanel;
    case 'github': return GithubPanel;
    case 'users': return UsersPanel;
    case 'settings': return SettingsPanel;
    default: return ResourcePanel;
  }
});
</script>

<style scoped>
.admin-layout { display: flex; height: 100vh; background-color: var(--md-sys-color-background); overflow: hidden; }
.sidebar { width: 280px; background-color: var(--md-sys-color-surface); display: flex; flex-direction: column; border-right: 1px solid var(--md-sys-color-outline); transition: width 0.3s ease; }
@media (max-width: 768px) { .sidebar { width: 72px; } .nav-text { display: none; } .brand { justify-content: center; padding: 24px 0 !important; } .nav-item { justify-content: center; padding: 16px 0 !important; } .bottom-action { padding: 24px 0 !important; } }
.brand { padding: 24px; display: flex; align-items: center; gap: 12px; color: var(--md-sys-color-primary); overflow: hidden; white-space: nowrap;}
.brand h2 { margin: 0; font-size: 1.5rem; color: var(--md-sys-color-on-surface); }
.nav-menu { flex-grow: 1; padding: 12px; display: flex; flex-direction: column; gap: 4px; overflow-x: hidden; }
.nav-item { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 28px; cursor: pointer; color: var(--md-sys-color-on-surface); transition: all 0.2s; font-weight: 500; white-space: nowrap;}
.nav-item:hover { background-color: var(--md-sys-color-surface-variant); }
.nav-item.active { background-color: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.bottom-action { padding: 24px; text-align: center; }

.content-area { flex-grow: 1; padding: 80px 24px 40px; overflow-y: auto; background-color: var(--md-sys-color-background); }
@media (min-width: 768px) { .content-area { padding: 80px 40px 40px; } }
.panel-fade-enter-active, .panel-fade-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.panel-fade-enter-from { opacity: 0; transform: translateX(20px); }
.panel-fade-leave-to { opacity: 0; transform: translateX(-20px); }
</style>