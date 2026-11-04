<template>
    <div class="panel">
      <div class="panel-header"><h2>站点设置</h2></div>
      <div class="settings-form md-elevation-1">
        <md-outlined-text-field label="站点名称" .value="siteSettingsForm.site_name" @input="siteSettingsForm.site_name = $event.target.value"></md-outlined-text-field>
        <md-outlined-text-field type="textarea" rows="6" label="首页描述 (支持 Markdown)" .value="siteSettingsForm.site_desc" @input="siteSettingsForm.site_desc = $event.target.value"></md-outlined-text-field>
        <div style="display: flex; gap: 16px;">
          <md-outlined-text-field type="number" label="普通用户每日下载配额" .value="siteSettingsForm.quota_daily" @input="siteSettingsForm.quota_daily = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field type="number" label="普通用户每月最高上限" .value="siteSettingsForm.quota_monthly" @input="siteSettingsForm.quota_monthly = $event.target.value"></md-outlined-text-field>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="font-weight: bold; color: var(--md-sys-color-on-surface); font-size: 0.9rem;">全站会话安全存活期</label>
          <select v-model="siteSettingsForm.session_timeout" class="modern-select">
            <option value="30m">30 分钟 (极高安全)</option><option value="1h">1 小时</option><option value="6h">6 小时</option><option value="12h">12 小时</option><option value="24h">24 小时 (默认)</option>
          </select>
        </div>
        <div class="form-actions"><md-filled-button @click="saveSettings">保存配置</md-filled-button></div>
      </div>
    </div>
  </template>
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { useAppStore } from '../../store';
  const store = useAppStore();
  const siteSettingsForm = ref({ site_name: '', site_desc: '', session_timeout: '24h', quota_daily: '5', quota_monthly: '30' }); 
  const fetchSettings = async () => { const res = await fetch('/api/settings'); const data = await res.json(); if (data.success) { siteSettingsForm.value = { site_name: data.settings.site_name || '', site_desc: data.settings.site_desc || '', session_timeout: data.settings.session_timeout || '24h', quota_daily: data.settings.quota_daily || '5', quota_monthly: data.settings.quota_monthly || '30' }; }};
  const saveSettings = async () => { await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteSettingsForm.value) }); store.showAlert("成功", "保存完毕"); };
  onMounted(fetchSettings);
  </script>
  <style scoped>@import './admin-shared.css';</style>