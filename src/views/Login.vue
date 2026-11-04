<template>
  <div class="login-container">
    <div class="login-card md-elevation-3">
      <div class="logo-area">
        <md-icon class="brand-icon">cloud_download</md-icon>
        <h2>资源平台登录</h2>
        <p>访问海量资源，管理系统数据</p>
      </div>

      <div class="form-area">
        <md-outlined-text-field 
          label="注册邮箱" 
          :value="email" 
          @input="email = $event.target.value" 
          type="email"
          @keyup.enter="handleLogin">
          <md-icon slot="leading-icon">mail</md-icon>
        </md-outlined-text-field>

        <md-outlined-text-field 
          label="密码" 
          :value="password" 
          @input="password = $event.target.value" 
          type="password"
          @keyup.enter="handleLogin">
          <md-icon slot="leading-icon">lock</md-icon>
        </md-outlined-text-field>
      </div>

      <div class="actions">
        <md-filled-button @click="handleLogin" class="login-btn" :disabled="loading">
          <md-icon slot="icon">{{ loading ? 'hourglass_empty' : 'login' }}</md-icon>
          {{ loading ? '验证中...' : '立即登录' }}
        </md-filled-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store';

const store = useAppStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const loading = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) {
    return store.showAlert("提示", "邮箱和密码不能为空！");
  }

  loading.value = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    const data = await res.json();

    if (data.success) {
      // 保存状态
      store.setLoginState(data.token, data.user.email, data.user.isAdmin);
      store.showAlert("🎉 登录成功", `欢迎回来！您当前的身份是：${data.user.isAdmin ? '【管理员】' : '【普通用户】'}`);
      
      // 添加延时跳转，让用户看清楚弹窗再过去
      setTimeout(() => {
        store.closeAlert();
        router.push('/dashboard');
      }, 1500);

      // 后续我们将在这里根据身份跳转到不同的面板，目前先留在这
      // if (data.user.isAdmin) router.push('/admin');
      // else router.push('/dashboard');
      
    } else {
      store.showAlert("❌ 登录失败", data.message);
    }
  } catch (e: any) {
    store.showAlert("异常", "无法连接到服务器。");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container { min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; background-color: var(--md-sys-color-background); }
.login-card { background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); border-radius: 28px; padding: 48px; width: 100%; max-width: 420px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); text-align: center; }
.logo-area { margin-bottom: 40px; }
.brand-icon { font-size: 64px; color: var(--md-sys-color-primary); }
.logo-area h2 { margin: 16px 0 8px; font-size: 1.8rem; }
.logo-area p { color: var(--md-sys-color-outline); margin: 0; }
.form-area { display: flex; flex-direction: column; gap: 24px; margin-bottom: 40px; }
md-outlined-text-field { width: 100%; --md-outlined-text-field-container-shape: 12px; }
.login-btn { width: 100%; height: 48px; border-radius: 24px; }
</style>