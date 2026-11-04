import { defineStore } from 'pinia';

export const THEME_COLORS = [
  { name: 'Google Blue', hue: 217 }, { name: 'Royal Purple', hue: 262 },
  { name: 'Emerald Green', hue: 158 }, { name: 'Sunset Orange', hue: 24 },
  { name: 'Crimson Red', hue: 348 }, { name: 'Teal Blue', hue: 187 },
  { name: 'Deep Pink', hue: 330 }, { name: 'Amber Gold', hue: 45 }
];

export const useAppStore = defineStore('app', {
  state: () => ({
    isDark: false,
    themeIndex: 0,
    dialog: { open: false, title: '', message: '' },
    // 新增：全局用户状态 (从 localStorage 恢复，保持会话)
    user: JSON.parse(localStorage.getItem('reiadown_user') || '{"token":"","email":"","isAdmin":false}')
  }),
  actions: {
    toggleDarkMode() { this.isDark = !this.isDark; },
    setTheme(index: number) { this.themeIndex = index; },
    showAlert(title: string, message: string) {
      this.dialog.title = title;
      this.dialog.message = message;
      this.dialog.open = true;
    },
    closeAlert() { this.dialog.open = false; },
    // 新增：保存登录信息
    setLoginState(token: string, email: string, isAdmin: boolean) {
      this.user = { token, email, isAdmin };
      localStorage.setItem('reiadown_user', JSON.stringify(this.user));
    },
    // 新增：退出登录
    logout() {
      this.user = { token: '', email: '', isAdmin: false };
      localStorage.removeItem('reiadown_user');
      window.location.href = '/login';
    }
  }
});