"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDbPools = exports.isInstalled = exports.newPool = exports.oldPool = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CONFIG_PATH = path_1.default.join(__dirname, '../database.json');
exports.oldPool = null;
exports.newPool = null;
const isInstalled = () => fs_1.default.existsSync(CONFIG_PATH);
exports.isInstalled = isInstalled;
const initDbPools = async () => {
    if (!(0, exports.isInstalled)())
        return false;
    try {
        const configStr = fs_1.default.readFileSync(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configStr);
        exports.oldPool = promise_1.default.createPool({ ...config.oldDb, waitForConnections: true, connectionLimit: 10 });
        exports.newPool = promise_1.default.createPool({ ...config.newDb, waitForConnections: true, connectionLimit: 10 });
        // 核心新增：自动在新数据库中创建所需的业务表
        // ==========================================
        // 2. 资源管理表 (固化终极零知识加密版)
        // ==========================================
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS resources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_id INT DEFAULT 0,
        type VARCHAR(20) DEFAULT 'file',
        name VARCHAR(255) NOT NULL,
        tags VARCHAR(255),
        link TEXT,
        sync_mode VARCHAR(50) DEFAULT 'general',
        oss_id INT DEFAULT NULL,
        object_key VARCHAR(255) DEFAULT NULL,   -- 指向专属哈希目录，如 encrypted_vault/abc123_xyz/
        is_encrypted BOOLEAN DEFAULT false,
        encrypt_key VARCHAR(255) DEFAULT NULL,
       file_size BIGINT DEFAULT 0,
        total_chunks INT DEFAULT 1,
        sort_order INT DEFAULT 0,
        folder_md LONGTEXT DEFAULT NULL,            -- 🌟 新增：存放目录的 Base64 Markdown
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        try {
            await exports.newPool.execute('ALTER TABLE github_tasks ADD COLUMN retention_limit INT DEFAULT 3');
        }
        catch (e) { }
        try {
            await exports.newPool.execute('ALTER TABLE resources ADD COLUMN folder_md LONGTEXT DEFAULT NULL');
        }
        catch (e) { }
        // 自动为旧表打上补丁（防止你之前的数据报错）
        try {
            await exports.newPool.execute('ALTER TABLE resources ADD COLUMN total_chunks INT DEFAULT 1');
        }
        catch (e) { }
        try {
            await exports.newPool.execute('ALTER TABLE resources ADD COLUMN sort_order INT DEFAULT 0');
        }
        catch (e) { }
        // 2. 网站设置表
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value TEXT
      )
    `);
        // ================= 3. OSS 配置表 (防报错升级版) =================
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS oss_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        region VARCHAR(50) NOT NULL DEFAULT 'us-east-1', -- 核心安全升级：加了默认值，后台旧代码漏传也绝不报错
        bucket VARCHAR(255) NOT NULL,
        access_key VARCHAR(255) NOT NULL,
        secret_key VARCHAR(255) NOT NULL,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // ======================================================
        // 3. 插入默认的网站设置
        await exports.newPool.execute(`
      INSERT IGNORE INTO site_settings (setting_key, setting_value) 
      VALUES 
      ('site_name', '资源下载站'), 
      ('site_desc', '欢迎来到资源中心 👋\\n\\n这里存放了各类精选资源。此段落由 Markdown 动态解析生成。')
    `);
        // ==========================================
        // 4. GitHub 自动同步任务表
        // ==========================================
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS github_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        repo_name VARCHAR(255) NOT NULL,            -- 例如: "Dreamacro/clash"
        oss_id INT NOT NULL,
        parent_folder_id INT DEFAULT 0,
        last_version VARCHAR(100) DEFAULT '',
        retention_limit INT DEFAULT 3,              -- 🌟 新增：默认保留 3 个历史版本
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // ==========================================
        // 5. 用户下载额度统计表 (高性能聚合表)
        // ==========================================
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS user_download_stats (
        email VARCHAR(255) NOT NULL,
        stat_date DATE NOT NULL,
        download_count INT DEFAULT 1,
        PRIMARY KEY (email, stat_date) -- 联合主键，确保每人每天只有一行记录
      )
    `);
        // 在系统设置表中插入默认的配额设置 (每天5次，每月30次)
        await exports.newPool.execute(`
      INSERT IGNORE INTO site_settings (setting_key, setting_value) 
      VALUES 
      ('quota_daily', '5'),
      ('quota_monthly', '30')
    `);
        // ==========================================
        // 6. 视频弹幕表 (Danmaku - 支持高级样式属性)
        // ==========================================
        await exports.newPool.execute(`
      CREATE TABLE IF NOT EXISTS danmaku (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_id INT NOT NULL,
        start_time INT NOT NULL,     -- 弹幕出现的时间 (毫秒)
        txt TEXT NOT NULL,           -- 弹幕内容
        color VARCHAR(20) DEFAULT '#ffffff',
        font_size VARCHAR(10) DEFAULT '20px', -- 新增：弹幕字号大小
        mode VARCHAR(10) DEFAULT 'scroll',    -- 新增：弹幕模式 (scroll/top/bottom)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(resource_id)
      )
    `);
        // 自动为旧数据库结构打上升级补丁
        try {
            await exports.newPool.execute('ALTER TABLE danmaku ADD COLUMN font_size VARCHAR(10) DEFAULT "20px"');
        }
        catch (e) { }
        try {
            await exports.newPool.execute('ALTER TABLE danmaku ADD COLUMN mode VARCHAR(10) DEFAULT "scroll"');
        }
        catch (e) { }
        console.log('✅ 双数据库连接池初始化成功，业务表验证完成！');
        return true;
    }
    catch (error) {
        console.error('❌ 数据库配置读取或建表失败:', error);
        return false;
    }
};
exports.initDbPools = initDbPools;
