import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: () => import('../views/Login.vue') },
  { path: '/install', component: () => import('../views/InstallWizard.vue') },
  { path: '/dashboard', component: () => import('../views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/admin', component: () => import('../views/Admin.vue'), meta: { requiresAuth: true, requiresAdmin: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

let isAppInitialized = false;

router.beforeEach(async (to, _from, next) => {
  // 1. 系统初始化与后端连通性检查 (增加重试机制)
  if (!isAppInitialized) {
    let installed = false;
    let backendReady = false;

    // 最多尝试 5 次 (约等 5 秒)，等待后端 Node.js 启动完毕
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch('/api/check-install');
        const contentType = res.headers.get("content-type");
        
        // 核心修复：不但要通，还必须返回 JSON，否则强制抛出错误去睡觉
        if (res.ok && contentType && contentType.includes("application/json")) {
          const data = await res.json();
          installed = data.installed;
          backendReady = true;
          break; // 后端连上了，跳出重试循环
        }
        throw new Error("Vite 代理未就绪或后端未启动");
      } catch (e) {
        console.warn(`等待后端启动中... 重试次数: ${i + 1}/5`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 每次失败老老实实等 1 秒
      }
    }

    if (!backendReady) {
      console.error("后端服务未启动或连接超时");
      // 5秒后还是连不上，只能强行去安装页
      if (to.path !== '/install') return next('/install');
      return next();
    }

    isAppInitialized = true;
    
    // 安装状态判断逻辑
    if (!installed && to.path !== '/install') return next('/install');
    if (installed && to.path === '/install') return next('/login');
  }

  // 2. 获取本地缓存的用户信息
  const userStr = localStorage.getItem('reiadown_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isLoggedIn = user && user.token;

  // 3. 权限拦截逻辑
  if (to.path === '/login' && isLoggedIn) {
    return next('/dashboard'); // 已登录禁止再进登录页
  }
  
  if (to.meta.requiresAuth && !isLoggedIn) {
    return next('/login'); // 未登录禁止进内部页面
  }
  
  if (to.meta.requiresAdmin && (!isLoggedIn || !user.isAdmin)) {
    return next('/dashboard'); // 非管理员禁止进后台
  }

  next();
});

export default router;