import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

// 引入所有使用的 Material Design 3 Web 组件
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/button/text-button.js'
import '@material/web/icon/icon.js'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/dialog/dialog.js'
import '@material/web/fab/fab.js' // 引入悬浮操作按钮
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'

import { polyfill } from "mobile-drag-drop";
import "mobile-drag-drop/default.css"; // 引入拖拽时的优雅视觉样式
polyfill({
  
  holdToDrag: 300 // 长按 300 毫秒触发拖拽
});
window.addEventListener('touchmove', function() {}, {passive: false});

const originalFetch = window.fetch;
window.fetch = async (input, init: any = {}) => {
  const userStr = localStorage.getItem('reiadown_user');
  if (userStr && typeof input === 'string' && input.startsWith('/api/')) {
    try {
      const user = JSON.parse(userStr);
      if (user.token) {
        init.headers = { ...init.headers, 'Authorization': `Bearer ${user.token}` };
      }
    } catch(e) {}
  }
  return originalFetch(input, init);
};

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')