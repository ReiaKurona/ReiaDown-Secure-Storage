
**ReiaDown-Secure-Storage** 是一套专为 Xboard 生态量身打造的 **零知识端到端加密（E2EE）存储、分发与流媒体服务框架**。

#### 1. 核心设计亮点
* **双数据库并联（Dual-DB Isolation）**：
  * **旧库（Xboard 用户库）**：**纯只读**。通过底层 SQL 仅检索 `v2_user` 表验证用户邮箱、Bcrypt 密码（代码自动兼容 PHP `$2y$` 与 Node `$2a$` 哈希）及 `is_admin` 角色，**绝不写入或修改 Xboard 的原生数据，主站升级零冲突**；
  * **新库（ReiaDown 业务库）**：**独立读写**。用于存储资源目录树、S3/OSS 配置、下载防刷配额、视频弹幕、GitHub 同步任务等独立业务数据。
* **零知识端到端加密（E2EE）与切片分发**：
  * 采用金融级 **Web Crypto API (AES-256-GCM)**；
  * 大文件在浏览器/前端自动切为 **10MB 加密分块** 后直传/下载到 S3 兼容对象存储（AWS S3、Cloudflare R2、阿里云 OSS、腾讯云 COS 等）；
  * 具备 **Service Worker 虚拟流媒体管道**（支持视频 Range 边下边解密边播）与 **WebSocket 实时同屏弹幕**。
* **配额防刷与数据库清道夫**：
  * 内置日/月下载配额熔断限制（`user_download_stats` 表高性能原子增量）；
  * 每日凌晨 3:00 自动执行 `DB Janitor` 清理过期历史统计，防止数据库膨胀。

---

### 二、 数据库初始化与安装向导机制（Web GUI）

整个系统**无需手动导入 `.sql` 脚本**，全部由可视化的内置安装向导自动完成健康校验与建表。

```text
[用户访问] ──> GET /api/check-install 
                │
                ├─► 检测到 database.json 不存在 ──► 前端路由强制拦截跳转 /install 向导
                └─► 已存在配置文件 ──────────────► 正常进入 /login 或 /dashboard
```

#### 安装向导工作流程（`InstallWizard.vue` ↔ `/api/install`）：
1. **访问向导**：首次部署启动后，访问页面会自动重定向到 `http://你的域名:5000/#/install`；
2. **填写双库凭据**：
   * **旧数据库（Xboard 验证库）**：填写 Xboard 所使用的 MySQL 地址（如 `127.0.0.1`）、账号、密码、库名（通常为 `xboard`）；
   * **新数据库（ReiaDown 业务库）**：在宝塔/MySQL 中提前新建一个干净的数据库（如 `reiadown_system`），在此填入对应连接信息；
3. **并联连通性健康探测**：
   * 点击【测试连接并安装】后，后端立刻对两台数据库分别执行 `SELECT 1` 探测；
   * 连通成功后，优先向浏览器响应成功信号，**延迟 1 秒安全写入根目录的 `database.json`**（防止 Node 热重启掐断 HTTP 响应）；
4. **自动建表迁移（`db.ts`）**：
   * 写入配置后连接池自动重启，程序会自动在新数据库中创建：
     * `resources`（资源目录树与加密元数据）
     * `site_settings`（系统与配额设置）
     * `oss_configs`（S3/OSS 多存储桶配置）
     * `github_tasks`（GitHub 发布包自动同步任务）
     * `user_download_stats`（日/月下载配额表）
     * `danmaku`（播放器弹幕表）
   * 自动打上版本字段升级补丁（`ALTER TABLE ...` 幂等兼容）；
5. 自动刷新页面，直接进入登录界面，使用 **Xboard 现有的注册账号与密码** 即可直接登录！

---

### 三、 完整安装与部署步骤

#### 1. 服务器环境准备
* **Node.js**：`>= 18.0.0`（推荐 Node 20 LTS）；
* **MySQL**：`>= 5.7` 或 `MariaDB >= 10.3`；
* **包管理工具**：`npm` 或 `pnpm`。

#### 2. 拉取代码与安装依赖
在服务器上克隆仓库并安装依赖：
```bash
git clone https://github.com/ReiaKurona/ReiaDown-Secure-Storage.git
cd ReiaDown-Secure-Storage

# 安装项目全量依赖（包含 AWS-SDK、Express、Vue3 等）
npm install
```

#### 3. 编译打包（前端与服务端）
仓库内配置了 TypeScript 双端编译脚本：
```bash
# 同时构建前端 Vite 静态产物 (输出到 dist/) 与 Node 服务端 TS (输出到 dist-server/)
npm run build
```
*(如果只改动了服务端逻辑，可单独执行 `npm run build:backend`；如果只改动了前端，执行 `npm run build:frontend`)*。

#### 4. 启动后台守护进程
推荐使用 **PM2** 进行长效后台进程守护与自启管理：

```bash
# 全局安装 PM2 (如已安装可跳过)
npm install -g pm2

# 使用 PM2 启动生产环境服务 (运行 dist-server/index.js)
pm2 start dist-server/index.js --name "reiadown"

# 保存当前运行列表并设置开机自启
pm2 save
pm2 startup
```
*如果不使用 PM2，可直接在当前窗口调试运行：`npm start`（默认监听 `5000` 端口）。*

#### 5. 反向代理配置（以 Nginx / 宝塔为例）
为了支持 HTTPS、域名访问以及 **WebSocket 实时弹幕同步**，在 Nginx 站点配置中加入反向代理：

```nginx
server {
    listen 80;
    server_name install.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name install.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 🌟 必须开启 WebSocket 支持（用于西瓜播放器实时弹幕互通）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 6. 浏览器访问与向导初始化
1. 打开浏览器，访问你的域名 `https://install.yourdomain.com`；
2. 系统检测到未安装，自动弹出 **“系统初始化部署向导”**；
3. 按照界面提示填入你的 **Xboard 数据库** 与 **ReiaDown 业务数据库** 信息；
4. 点击测试连接并安装，2 秒后系统完成初始化并自动建表；
5. 输入你的 Xboard 账号密码登录，至此全部部署完毕！
