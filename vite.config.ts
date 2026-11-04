import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag.startsWith('md-') }
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err: any, _req, res) => {
            if (err.code === 'ECONNREFUSED' && !res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ installed: false, message: 'Backend is booting...' }));
            }
          });
        }
      }
    }
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true, 
    chunkSizeWarningLimit: 500, // 恢复正常阈值
    rollupOptions: {
      output: {
        manualChunks(id) {
          
          if (id.includes('src/store/')) return 'app-store';
          if (id.includes('src/utils/')) return 'app-crypto-engine';

          if (id.includes('node_modules')) {
            // 1. Vue 核心底座
            if (id.includes('node_modules/vue/') || id.includes('node_modules/@vue/')) return 'core-vue';
            if (id.includes('node_modules/vue-router/')) return 'core-router';
            if (id.includes('node_modules/pinia/')) return 'core-pinia';

            // 🌟 2. 核心修复：把所有 Lit 引擎和 MD3 变体强行捆绑在一起，彻底解决时序崩溃！
            if (
              id.includes('/@material/web/') || 
              id.includes('/lit/') || 
              id.includes('/lit-html/') || 
              id.includes('/lit-element/') || 
              id.includes('/@lit/')
            ) {
              return 'ui-md3';
            }

            // 3. 重量级云端引擎 (懒加载)
            if (id.includes('/@aws-sdk/') || id.includes('/@smithy/') || id.includes('/fast-xml-parser/')) {
              return 'engine-aws';
            }
            if (id.includes('/markdown-it/')) {
              return 'engine-markdown';
            }

            // 4. 其他散装 NPM 包
            const match = id.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
            if (match) {
              const pkgName = match[1].replace('@', '');
              return `npm-${pkgName}`;
            }
          }
        }
      }
    }
  }
})