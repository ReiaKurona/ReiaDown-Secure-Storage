<template>
  <div class="wizard-container">
    <div class="wizard-card md-elevation-3">
      <div class="header">
        <md-icon style="font-size: 48px; color: var(--md-sys-color-primary)">settings_suggest</md-icon>
        <h2>系统初始化部署向导</h2>
        <p>配置您的旧用户数据库与全新系统数据库</p>
      </div>

      <div class="form-grid">
        <!-- 旧数据库 (只读验证) -->
        <div class="db-section">
          <h3><md-icon>vpn_key</md-icon> 旧数据库 (验证用户/只读)</h3>
          <md-outlined-text-field label="数据库地址" :value="form.oldDb.host" @input="form.oldDb.host = $event.target.value" type="text"></md-outlined-text-field>
          <md-outlined-text-field label="用户名" :value="form.oldDb.user" @input="form.oldDb.user = $event.target.value" type="text"></md-outlined-text-field>
          <md-outlined-text-field label="密码" :value="form.oldDb.password" @input="form.oldDb.password = $event.target.value" type="password"></md-outlined-text-field>
          <md-outlined-text-field label="数据库名" :value="form.oldDb.database" @input="form.oldDb.database = $event.target.value" type="text"></md-outlined-text-field>
        </div>

        <!-- 新数据库 (读写) -->
        <div class="db-section">
          <h3><md-icon>database</md-icon> 新数据库 (业务存储/读写)</h3>
          <md-outlined-text-field label="数据库地址" :value="form.newDb.host" @input="form.newDb.host = $event.target.value" type="text"></md-outlined-text-field>
          <md-outlined-text-field label="用户名" :value="form.newDb.user" @input="form.newDb.user = $event.target.value" type="text"></md-outlined-text-field>
          <md-outlined-text-field label="密码" :value="form.newDb.password" @input="form.newDb.password = $event.target.value" type="password"></md-outlined-text-field>
          <md-outlined-text-field label="数据库名" :value="form.newDb.database" @input="form.newDb.database = $event.target.value" type="text"></md-outlined-text-field>
        </div>
      </div>

      <div class="actions">
        <md-filled-button @click="submitSetup">
          <md-icon slot="icon">rocket_launch</md-icon>
          测试连接并安装
        </md-filled-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useAppStore } from '../store';

const store = useAppStore();

// 响应式表单数据
const form = reactive({
  oldDb: { host: '127.0.0.1', user: 'root', password: '', database: 'old_system_db' },
  newDb: { host: '127.0.0.1', user: 'root', password: '', database: 'reiadown_system' }
});

const submitSetup = async () => {
  store.showAlert("连接中", "正在并联验证双数据库状态，请稍候...");
  try {
    const res = await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    
    // 核心修复：先拿到原始文本，不管它是不是 JSON
    const text = await res.text(); 
    
    if (!res.ok) {
      // 如果后端返回了 500 错误
      try {
        const errorData = JSON.parse(text);
        store.showAlert("❌ 安装失败", errorData.message);
      } catch (e) {
        store.showAlert("❌ 请求异常", "服务器无响应或挂掉，请查看后端控制台报错。");
      }
      return;
    }
    
    // 成功状态下解析 JSON
    const data = JSON.parse(text);
    
    if (data.success) {
      store.showAlert("✅ 安装成功", data.message + " 点击确认即将刷新进入登录界面！");
      setTimeout(() => {
        window.location.reload(); 
      }, 2500);
    }
  } catch (e: any) {
    store.showAlert("前端请求报错", e.message);
  }
}
</script>

<style scoped>
/* 样式与之前保持一致 */
.wizard-container { min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; background-color: var(--md-sys-color-background); }
.wizard-card { background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); border-radius: 24px; padding: 40px; max-width: 900px; width: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: all 0.3s ease; }
.header { text-align: center; margin-bottom: 30px; }
.header h2 { margin: 10px 0 5px; }
.header p { color: var(--md-sys-color-outline); margin: 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
@media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } }
.db-section { display: flex; flex-direction: column; gap: 16px; }
.db-section h3 { display: flex; align-items: center; gap: 8px; font-size: 1.1rem; border-bottom: 1px solid var(--md-sys-color-outline); padding-bottom: 8px; margin-bottom: 8px;}
md-outlined-text-field { width: 100%; }
.actions { display: flex; justify-content: center; margin-top: 40px; }
</style>