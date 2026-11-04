"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const promise_1 = __importDefault(require("mysql2/promise"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
// @ts-ignore
const node_cron_1 = __importDefault(require("node-cron"));
const githubSync_1 = require("./githubSync");
const http_1 = __importDefault(require("http"));
// @ts-ignore
const ws_1 = require("ws");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 🛡️ 安全拦截器中间件 🛡️
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
        return res.status(401).json({ success: false, message: "非法访问：未提供身份凭证" });
    try {
        req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        next();
    }
    catch (e) {
        res.status(401).json({ success: false, message: "会话已过期或无效" });
    }
};
const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (!req.user.isAdmin)
            return res.status(403).json({ success: false, message: "越权访问：需要超级管理员权限" });
        next();
    });
};
// 启动时尝试加载数据库
(0, db_1.initDbPools)();
// API 1: 前端查询安装状态
app.get('/api/check-install', (_req, res) => {
    res.json({ installed: (0, db_1.isInstalled)() });
});
// API 2: 接收配置并真实测试 MySQL 并联验证
app.post('/api/install', async (req, res) => {
    const { oldDb, newDb } = req.body;
    try {
        // 1. 测试旧数据库连通性 (执行一个极简 SQL 来验证)
        const connOld = await promise_1.default.createConnection(oldDb);
        await connOld.execute('SELECT 1');
        await connOld.end();
        // 2. 测试新数据库连通性
        const connNew = await promise_1.default.createConnection(newDb);
        await connNew.execute('SELECT 1');
        await connNew.end();
        // 3. 【核心修复】先将成功的 JSON 发送给前端浏览器！
        res.json({ success: true, message: "双数据库并联验证成功！系统已完成初始化。" });
        // 4. 【核心修复】延迟 1 秒后，再写入文件并重启连接池。
        // 这样就不会因为热更新瞬间切断刚才发给前端的 response 了
        setTimeout(() => {
            const CONFIG_PATH = path_1.default.join(__dirname, '../database.json');
            fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify({ oldDb, newDb }, null, 2));
            (0, db_1.initDbPools)();
        }, 1000);
    }
    catch (error) {
        console.error("数据库连接测试失败:", error.message);
        res.status(500).json({ success: false, message: "数据库连接失败，请检查账号密码：" + error.message });
    }
});
const JWT_SECRET = 'reiadown_super_secret_key_2026'; // Token 签名密钥
// API 3: 联合登录验证 (动态会话有效期)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!db_1.oldPool)
        return res.status(500).json({ success: false, message: "系统未初始化" });
    try {
        const [rows] = await db_1.oldPool.execute('SELECT email, password, is_admin FROM v2_user WHERE email = ? LIMIT 1', [email]);
        if (rows.length === 0)
            return res.status(401).json({ success: false, message: "该用户不存在" });
        const user = rows[0];
        let dbHash = user.password;
        if (dbHash.startsWith('$2y$'))
            dbHash = dbHash.replace('$2y$', '$2a$');
        const isValid = await bcryptjs_1.default.compare(password, dbHash);
        if (!isValid)
            return res.status(401).json({ success: false, message: "密码错误" });
        // 从数据库读取后台设置的会话有效期，默认 24h
        let sessionTimeout = '24h';
        try {
            const [settingRows] = await db_1.newPool.execute("SELECT setting_value FROM site_settings WHERE setting_key = 'session_timeout'");
            if (settingRows.length > 0)
                sessionTimeout = settingRows[0].setting_value;
        }
        catch (e) { }
        const isAdmin = user.is_admin === 1;
        const token = jsonwebtoken_1.default.sign({ email: user.email, isAdmin }, JWT_SECRET, { expiresIn: sessionTimeout });
        res.json({ success: true, message: "登录成功", token, user: { email: user.email, isAdmin }, timeout: sessionTimeout });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "内部错误" });
    }
});
// API 4: 获取用户列表 (管理员专属：跨库只读查询旧数据库)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        // 强制只读查询，绝不执行 UPDATE/DELETE
        const [rows] = await db_1.oldPool.execute('SELECT email, is_admin FROM v2_user ORDER BY is_admin DESC, email ASC');
        res.json({ success: true, users: rows });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "查询用户失败: " + error.message });
    }
});
// API 5: 获取网站系统设置 (新库查询)
app.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const [rows] = await db_1.newPool.execute('SELECT setting_key, setting_value FROM site_settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});
        res.json({ success: true, settings });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "获取设置失败" });
    }
});
// ==========================================
// API 6: 获取资源列表 (已登录用户可用，额外返回目录 Markdown)
// ==========================================
app.get('/api/admin/resources', requireAuth, async (req, res) => {
    const parentId = parseInt(req.query.parentId) || 0;
    try {
        // 1. 查询当前文件夹下的所有子文件和子文件夹
        const [rows] = await db_1.newPool.execute(`SELECT id, parent_id, type, name, tags, link, sync_mode, is_encrypted, file_size, total_chunks, sort_order, created_at, 
      IF(oss_id IS NOT NULL, 1, 0) AS oss_id 
      FROM resources WHERE parent_id = ? ORDER BY type DESC, COALESCE(NULLIF(sort_order, 0), id) DESC`, [parentId]);
        // 2. 安全读取当前父目录的 Markdown 描述文本
        let folderMd = null;
        if (parentId > 0) {
            const [parentRows] = await db_1.newPool.execute('SELECT folder_md FROM resources WHERE id = ? LIMIT 1', [parentId]);
            if (parentRows.length > 0) {
                folderMd = parentRows[0].folder_md;
            }
        }
        // 3. 一并返回给前端
        res.json({ success: true, resources: rows, folder_md: folderMd });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "获取资源失败: " + error.message });
    }
});
// API 7: 添加新资源 / 文件夹 (支持碎片总数记录)
app.post('/api/admin/resources', requireAdmin, async (req, res) => {
    const { parent_id, type, name, tags, link, oss_id, object_key, is_encrypted, encrypt_key, file_size, total_chunks } = req.body;
    try {
        await db_1.newPool.execute(`INSERT INTO resources 
      (parent_id, type, name, tags, link, oss_id, object_key, is_encrypted, encrypt_key, file_size, total_chunks) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            parent_id || 0, type || 'file', name, tags || '', link || '',
            oss_id || null, object_key || null, is_encrypted ? 1 : 0, encrypt_key || null, file_size || 0, total_chunks || 1
        ]);
        res.json({ success: true, message: "资源添加成功" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "添加失败: " + error.message });
    }
});
// API 8: 编辑资源
app.put('/api/admin/resources/:id', requireAdmin, async (req, res) => {
    const resourceId = req.params.id;
    const { name, tags, link } = req.body;
    try {
        // 编辑时目前只允许修改名称、标签和直链（如果是外链资源）
        await db_1.newPool.execute('UPDATE resources SET name = ?, tags = ?, link = ? WHERE id = ?', [name, tags || '', link || '', resourceId]);
        res.json({ success: true, message: "更新成功" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "更新失败: " + error.message });
    }
});
// ==========================================
// API 9: 终极递归删除引擎 (彻底粉碎目录树及所有 OSS 碎片)
// ==========================================
// 递归搜集所有子孙节点的 ID
async function getAllDescendants(startId) {
    let allIds = [startId];
    let currentParentIds = [startId];
    while (currentParentIds.length > 0) {
        // 动态构建 IN 查询参数
        const placeholders = currentParentIds.map(() => '?').join(',');
        const [children] = await db_1.newPool.query(`SELECT id FROM resources WHERE parent_id IN (${placeholders})`, currentParentIds);
        if (children.length === 0)
            break;
        currentParentIds = children.map((c) => c.id);
        allIds.push(...currentParentIds);
    }
    return allIds;
}
app.delete('/api/admin/resources/:id', async (req, res) => {
    try {
        const rootId = parseInt(req.params.id);
        const targetIds = await getAllDescendants(rootId);
        // 1. 获取这批资源中所有关联了 OSS 的云端目录
        const placeholders = targetIds.map(() => '?').join(',');
        const [ossResRows] = await db_1.newPool.query(`SELECT oss_id, object_key FROM resources WHERE id IN (${placeholders}) AND oss_id IS NOT NULL AND object_key IS NOT NULL`, targetIds);
        // 2. 分类处理 OSS 销毁任务
        const ossTasks = {};
        ossResRows.forEach((r) => {
            if (!ossTasks[r.oss_id])
                ossTasks[r.oss_id] = [];
            ossTasks[r.oss_id].push(r.object_key);
        });
        for (const [ossIdStr, objectKeys] of Object.entries(ossTasks)) {
            const ossId = parseInt(ossIdStr);
            const [ossConfigRows] = await db_1.newPool.execute('SELECT * FROM oss_configs WHERE id = ?', [ossId]);
            if (ossConfigRows.length === 0)
                continue;
            const oss = ossConfigRows[0];
            const client = new client_s3_1.S3Client({
                region: oss.region || 'us-east-1',
                endpoint: oss.endpoint.startsWith('http') ? oss.endpoint : `https://${oss.endpoint}`,
                credentials: { accessKeyId: oss.access_key, secretAccessKey: oss.secret_key }
            });
            // 遍历每个被删文件的云端哈希目录
            for (const objKey of objectKeys) {
                try {
                    let isTruncated = true;
                    let continuationToken = undefined;
                    while (isTruncated) {
                        const listParams = { Bucket: oss.bucket, Prefix: objKey };
                        if (continuationToken)
                            listParams.ContinuationToken = continuationToken;
                        const listedObjects = await client.send(new client_s3_1.ListObjectsV2Command(listParams));
                        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
                            const deletePromises = listedObjects.Contents.map(item => client.send(new client_s3_1.DeleteObjectCommand({ Bucket: oss.bucket, Key: item.Key })));
                            await Promise.all(deletePromises);
                        }
                        isTruncated = listedObjects.IsTruncated || false;
                        continuationToken = listedObjects.NextContinuationToken;
                    }
                    await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: oss.bucket, Key: `${objKey}/` })).catch(() => { });
                    await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: oss.bucket, Key: objKey })).catch(() => { });
                }
                catch (e) {
                    console.error(`清理云端 ${objKey} 失败`);
                }
            }
        }
        // 3. 数据库斩草除根
        await db_1.newPool.query(`DELETE FROM resources WHERE id IN (${placeholders})`, targetIds);
        res.json({ success: true, message: `成功删除了 ${targetIds.length} 个项目及云端数据` });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "删除失败: " + error.message });
    }
});
// API 10: 更新系统设置 (支持批量更新)
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            // 核心修复：强制转为 String，满足 TypeScript 严格类型检查
            const valStr = value !== null && value !== undefined ? String(value) : '';
            // MySQL 语法：如果主键不存在就插入，存在就更新
            await db_1.newPool.execute('INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?', [key, valStr, valStr]);
        }
        res.json({ success: true, message: "系统配置已成功保存！" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "更新配置失败: " + error.message });
    }
});
// ==========================================
// API 11: OSS 对象存储配置管理 (终极防线版)
// ==========================================
// 获取 (追加控制台日志，方便我们排查)
app.get('/api/admin/oss', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db_1.newPool.execute('SELECT id, name, provider, endpoint, region, bucket, access_key, secret_key, is_public FROM oss_configs ORDER BY id DESC');
        // 调试日志：在你的 VSCode 终端打印查到的真实数据
        console.log("➡️ 后端数据库成功查出 OSS 数据，准备发送给前端:", rows);
        res.json({ success: true, configs: rows });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "获取OSS配置失败" });
    }
});
// 添加
app.post('/api/admin/oss', requireAdmin, async (req, res) => {
    const { name, provider, endpoint, region, bucket, access_key, secret_key, is_public } = req.body;
    try {
        await db_1.newPool.execute('INSERT INTO oss_configs (name, provider, endpoint, region, bucket, access_key, secret_key, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            name || '',
            provider || 's3',
            endpoint || '',
            region || 'us-east-1', // 强制非空兜底
            bucket || '',
            access_key || '',
            secret_key || '',
            is_public ? 1 : 0
        ]);
        res.json({ success: true, message: "OSS 配置添加成功" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "添加失败: " + error.message });
    }
});
app.put('/api/admin/oss/:id', requireAdmin, async (req, res) => {
    const { name, provider, endpoint, region, bucket, access_key, secret_key, is_public } = req.body;
    try {
        await db_1.newPool.execute('UPDATE oss_configs SET name=?, provider=?, endpoint=?, region=?, bucket=?, access_key=?, secret_key=?, is_public=? WHERE id=?', [name || '', provider || 's3', endpoint || '', region || '', bucket || '', access_key || '', secret_key || '', is_public ? 1 : 0, req.params.id]);
        res.json({ success: true, message: "配置已更新" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "更新失败: " + error.message });
    }
});
// 删除 (新增删除接口)
app.delete('/api/admin/oss/:id', requireAdmin, async (req, res) => {
    const ossId = req.params.id;
    try {
        await db_1.newPool.execute('DELETE FROM oss_configs WHERE id = ?', [ossId]);
        // 调试日志
        console.log(`➡️ 后端数据库成功删除 ID 为 ${ossId} 的 OSS 配置`);
        res.json({ success: true, message: "OSS 配置已成功删除" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "删除失败: " + error.message });
    }
});
app.post('/api/admin/oss/test', requireAdmin, async (req, res) => {
    const { endpoint, region, bucket, access_key, secret_key } = req.body;
    try {
        const formattedEndpoint = (endpoint || '').startsWith('http') ? endpoint : `https://${endpoint}`;
        const client = new client_s3_1.S3Client({
            region: region || 'us-east-1',
            endpoint: formattedEndpoint,
            credentials: { accessKeyId: access_key || '', secretAccessKey: secret_key || '' }
        });
        const command = new client_s3_1.ListObjectsV2Command({ Bucket: bucket || '', MaxKeys: 1 });
        await client.send(command);
        res.json({ success: true, message: "🎉 连接成功！凭据有效。" });
    }
    catch (error) {
        const errorMsg = error.$metadata?.httpStatusCode ? `HTTP 状态码 ${error.$metadata.httpStatusCode}` : error.message;
        res.json({ success: false, message: "连接测试失败: " + errorMsg });
    }
});
// ==========================================
// API 13: 获取下载链接与密钥 (工业级聚合防刷与配额冷却引擎)
// ==========================================
app.get('/api/resources/:id/download', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return res.status(401).json({ success: false, message: "未授权的会话" });
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.decode(token);
        if (!decoded || !decoded.email)
            return res.status(401).json({ success: false, message: "无效的会话" });
        const userEmail = decoded.email;
        const isAdmin = decoded.isAdmin;
        const [resRows] = await db_1.newPool.execute('SELECT * FROM resources WHERE id = ?', [req.params.id]);
        if (resRows.length === 0)
            return res.status(404).json({ success: false, message: "资源不存在" });
        const resource = resRows[0];
        // 统一下发日期的字符串格式，确保前后端时区绝对对齐
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        // 🌟 核心防线：普通用户的高性能聚合配额校验 🌟
        if (!isAdmin) {
            const [settingRows] = await db_1.newPool.execute("SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('quota_daily', 'quota_monthly')");
            let quotaDaily = 5, quotaMonthly = 30;
            settingRows.forEach((row) => {
                if (row.setting_key === 'quota_daily')
                    quotaDaily = parseInt(row.setting_value) || 5;
                if (row.setting_key === 'quota_monthly')
                    quotaMonthly = parseInt(row.setting_value) || 30;
            });
            // 1. 高性能查今日配额 (直接读单个数字)
            const [dailyRows] = await db_1.newPool.execute('SELECT download_count FROM user_download_stats WHERE email = ? AND stat_date = ?', [userEmail, todayStr]);
            const dailyCount = dailyRows.length > 0 ? dailyRows[0].download_count : 0;
            // 2. 高性能查本月总配额 (将本月这十几行的数字瞬间相加)
            const [monthlyRows] = await db_1.newPool.execute('SELECT SUM(download_count) as total FROM user_download_stats WHERE email = ? AND stat_date >= ?', [userEmail, startOfMonthStr]);
            const monthlyCount = monthlyRows[0].total ? parseInt(monthlyRows[0].total) : 0;
            // 3. 熔断与冷却期计算
            if (monthlyCount >= quotaMonthly || dailyCount >= quotaDaily) {
                let resetDate = new Date();
                let limitType = '';
                if (monthlyCount >= quotaMonthly) {
                    limitType = '本月';
                    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); // 次月1号
                }
                else {
                    limitType = '今日';
                    resetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // 次日
                }
                const diff = resetDate.getTime() - now.getTime();
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const mins = Math.floor((diff / 1000 / 60) % 60);
                let timeStr = '';
                if (days > 0)
                    timeStr += `${days}天`;
                if (hours > 0)
                    timeStr += `${hours}小时`;
                if (mins > 0)
                    timeStr += `${mins}分`;
                if (timeStr === '')
                    timeStr = '少于1分钟';
                const dateStr = `${resetDate.getFullYear()}-${String(resetDate.getMonth() + 1).padStart(2, '0')}-${String(resetDate.getDate()).padStart(2, '0')} 00:00:00`;
                return res.status(403).json({
                    success: false,
                    message: `超出${limitType}下载配额上限！\n您可以在 ${timeStr} 后 (${dateStr}) 继续要求下载。`
                });
            }
        }
        // ===============================================
        // 下发安全凭证与加密密钥
        // ===============================================
        let payloadStr = "";
        if (!resource.oss_id) {
            payloadStr = JSON.stringify({ success: true, isLink: true, downloadUrl: resource.link });
        }
        else {
            const [ossRows] = await db_1.newPool.execute('SELECT * FROM oss_configs WHERE id = ?', [resource.oss_id]);
            const oss = ossRows[0];
            const client = new client_s3_1.S3Client({
                region: oss.region || 'us-east-1',
                endpoint: oss.endpoint.startsWith('http') ? oss.endpoint : `https://${oss.endpoint}`,
                credentials: { accessKeyId: oss.access_key, secretAccessKey: oss.secret_key }
            });
            const downloadUrls = [];
            const totalChunks = resource.total_chunks || 1;
            const hashDir = resource.object_key;
            for (let i = 0; i < totalChunks; i++) {
                const chunkKey = `${hashDir}/${hashDir.split('/')[1]}_chunk_${i}.bin`;
                const command = new client_s3_1.GetObjectCommand({ Bucket: oss.bucket, Key: chunkKey });
                downloadUrls.push(await (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: 3600 }));
            }
            payloadStr = JSON.stringify({
                success: true, isLink: false, downloadUrls, total_chunks: totalChunks,
                is_encrypted: resource.is_encrypted === 1, encrypt_key: resource.encrypt_key, file_name: resource.name
            });
        }
        // 🌟 高性能原子计数：如果主键不存在就插入1，存在就直接加1，完美防并发多线程刷量 🌟
        if (!isAdmin) {
            await db_1.newPool.execute('INSERT INTO user_download_stats (email, stat_date, download_count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE download_count = download_count + 1', [userEmail, todayStr]);
        }
        // 会话密钥加密
        const sessionKey = crypto_1.default.createHash('sha256').update(token).digest();
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv('aes-256-gcm', sessionKey, iv);
        let encryptedBase64 = cipher.update(payloadStr, 'utf8', 'base64');
        encryptedBase64 += cipher.final('base64');
        res.json({ e2ee: true, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encryptedBase64 });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "获取失败: " + error.message });
    }
});
// ==========================================
// API 14: 批量签发哈希目录型分块上传链接 (极速并发版)
// ==========================================
app.post('/api/admin/oss/chunk_upload/presign', requireAdmin, async (req, res) => {
    const { oss_id, total_chunks } = req.body;
    try {
        const [ossRows] = await db_1.newPool.execute('SELECT * FROM oss_configs WHERE id = ?', [oss_id]);
        if (ossRows.length === 0)
            return res.status(404).json({ success: false, message: "配置不存在" });
        const oss = ossRows[0];
        const client = new client_s3_1.S3Client({
            region: oss.region || 'us-east-1',
            endpoint: oss.endpoint.startsWith('http') ? oss.endpoint : `https://${oss.endpoint}`,
            credentials: { accessKeyId: oss.access_key, secretAccessKey: oss.secret_key }
        });
        // 生成专属的随机哈希目录名
        const hashDir = `encrypted_vault/${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const uploadUrls = [];
        // 瞬间在内存中签发所有碎片的 PUT 链接 (不耗费网络，极快)
        for (let i = 0; i < total_chunks; i++) {
            const chunkKey = `${hashDir}/${hashDir.split('/')[1]}_chunk_${i}.bin`;
            const command = new client_s3_1.PutObjectCommand({ Bucket: oss.bucket, Key: chunkKey, ContentType: 'application/octet-stream' });
            const url = await (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: 3600 });
            uploadUrls.push(url);
        }
        res.json({ success: true, objectKey: hashDir, uploadUrls });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==========================================
// API 17: 批量更新资源排序 (持久化拖拽排序)
// ==========================================
app.post('/api/admin/resources/reorder', requireAdmin, async (req, res) => {
    const { updates } = req.body; // 接收格式: [{id: 1, sort_order: 10}, {id: 2, sort_order: 20}]
    if (!Array.isArray(updates))
        return res.status(400).json({ success: false, message: "参数格式错误" });
    try {
        // 开启 MySQL 事务 (Transaction)，保证双向互换同时成功
        const connection = await db_1.newPool.getConnection();
        await connection.beginTransaction();
        try {
            for (const item of updates) {
                await connection.execute('UPDATE resources SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
            await connection.commit(); // 提交保存
        }
        catch (err) {
            await connection.rollback(); // 发生错误瞬间回滚
            throw err;
        }
        finally {
            connection.release(); // 释放连接池
        }
        res.json({ success: true, message: "排序状态已永久保存" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "保存排序失败: " + error.message });
    }
});
// ==========================================
// API 18: GitHub 同步任务管理
// ==========================================
// 获取任务列表
app.get('/api/admin/github-tasks', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db_1.newPool.execute('SELECT * FROM github_tasks ORDER BY id DESC');
        res.json({ success: true, tasks: rows });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// 添加新任务并立刻触发首次同步
app.post('/api/admin/github-tasks', requireAdmin, async (req, res) => {
    const { repo_name, oss_id, parent_folder_id } = req.body;
    try {
        const [result] = await db_1.newPool.execute('INSERT INTO github_tasks (repo_name, oss_id, parent_folder_id) VALUES (?, ?, ?)', [repo_name, oss_id, parent_folder_id || 0]);
        res.json({ success: true, message: "任务添加成功，已放入后台同步队列" });
        // 异步触发刚添加的任务（不阻塞前端响应）
        setTimeout(() => {
            db_1.newPool.execute('SELECT * FROM github_tasks WHERE id = ?', [result.insertId])
                .then(([rows]) => { if (rows.length > 0)
                (0, githubSync_1.runGithubSyncTask)(rows[0]); });
        }, 1000);
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// 删除任务
app.delete('/api/admin/github-tasks/:id', requireAdmin, async (req, res) => {
    try {
        await db_1.newPool.execute('DELETE FROM github_tasks WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: "任务已删除" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// 🌟 启动后台守护定时任务：每 4 小时巡检一次所有 GitHub 仓库是否有更新 🌟
node_cron_1.default.schedule('0 */4 * * *', () => {
    console.log("⏰ 触发定时任务：检查 GitHub 发布包更新...");
    (0, githubSync_1.triggerAllSyncs)();
});
// ==========================================
// API 19: 批量删除资源 (调用递归删除引擎)
// ==========================================
app.post('/api/admin/resources/batch-delete', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ success: false });
    try {
        for (const id of ids) {
            // 内部调用本机 API，复用最强大的递归清理逻辑
            await fetch(`http://localhost:${process.env.PORT || 5000}/api/admin/resources/${id}`, { method: 'DELETE' });
        }
        res.json({ success: true, message: "批量清理完成" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==========================================
// API 20: 更新目录专属 Markdown 描述
// ==========================================
app.put('/api/admin/resources/:id/folder-desc', async (req, res) => {
    const { folder_md } = req.body; // 接收明文或 Base64
    try {
        await db_1.newPool.execute('UPDATE resources SET folder_md = ? WHERE id = ?', [folder_md || null, req.params.id]);
        res.json({ success: true, message: "目录描述已更新" });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "更新失败" });
    }
});
// ==========================================
// API 21: 弹幕引擎 (高级属性获取)
// ==========================================
app.get('/api/resources/:id/danmaku', async (req, res) => {
    try {
        const [rows] = await db_1.newPool.execute('SELECT id, start_time as start, txt, color, font_size, mode FROM danmaku WHERE resource_id = ? ORDER BY start_time ASC', [req.params.id]);
        // 格式化为西瓜播放器高能效弹幕数据格式
        const comments = rows.map((r) => ({
            id: r.id.toString(),
            duration: 5000, // 强制 5s 快速闪过，极致防遮挡体验
            start: r.start,
            txt: r.txt,
            mode: r.mode || 'scroll',
            style: { color: r.color, fontSize: r.font_size || '20px', textShadow: '1px 1px 2px #000' }
        }));
        res.json({ success: true, comments });
    }
    catch (error) {
        res.status(500).json({ success: false });
    }
});
// 发送弹幕
app.post('/api/resources/:id/danmaku', async (req, res) => {
    const { start, txt, color, font_size, mode } = req.body;
    try {
        await db_1.newPool.execute('INSERT INTO danmaku (resource_id, start_time, txt, color) VALUES (?, ?, ?, ?)', [req.params.id, start, txt, color || '#ffffff']);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false });
    }
});
// 静态文件托管 (生产环境用)
const distPath = path_1.default.join(__dirname, '../dist');
app.use(express_1.default.static(distPath));
// 【核心修复】安全地处理所有未命中的路由，防止 dist 目录不存在时系统崩溃
app.get('*', (_req, res) => {
    const indexPath = path_1.default.join(distPath, 'index.html');
    if (fs_1.default.existsSync(indexPath)) {
        res.sendFile(indexPath);
    }
    else {
        // 如果 dist 目录不存在（比如在新电脑上还没执行 build），给出一个精致的友好提示，而不让程序崩溃
        res.status(404).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>Vite 前端尚未打包</h2>
        <p style="color: gray;">系统运行在开发模式下，请访问前端开发端口：<a href="http://localhost:3000">http://localhost:3000</a></p>
        <p style="font-size: 0.9rem; color: #ff5252;">(或在控制台运行 'npm run build' 生成生产环境 dist 文件)</p>
      </div>
    `);
    }
});
// 1. 将 Express 升级绑定到 Node 原生 HTTP 协议服务器上
const server = http_1.default.createServer(app);
// 2. 挂载高性能 WebSocket 服务，彻底杜绝轮询网络消耗
const wss = new ws_1.WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            if (parsed.type === 'danmaku_send') {
                // 瞬间广播给全网其它正在同屏下载/预览该视频的所有在线客户端
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'danmaku_receive',
                            resourceId: parsed.resourceId,
                            comment: parsed.comment
                        }));
                    }
                });
            }
        }
        catch (e) { }
    });
});
// 处理 HTTP 协议升级为 WS 协议的握手动作 (🌟 修复：将所有底层参数全部加上 : any 显式声明)
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
// 3. 启动一体化安全服务器
server.listen(PORT, () => {
    console.log(`Unified Secure Server running on http://localhost:${PORT}`);
    console.log(`✅ 双数据库连接池初始化成功，业务表验证完成！`);
});
// ==========================================
// 🌟 数据库清道夫 (DB Janitor)：自动销毁过期配额记录
// ==========================================
// 设定为每天凌晨 3:00 执行清理任务
node_cron_1.default.schedule('0 3 * * *', async () => {
    if (!db_1.newPool)
        return;
    console.log("🧹 [DB Janitor] 开始执行过期配额记录自动清理...");
    try {
        const now = new Date();
        // 计算出本月 1 号的日期字符串 (例如 2026-06-01)
        const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        // 物理毁灭：把所有早于“本月1号”的旧记录全部彻底删除！
        const [result] = await db_1.newPool.execute('DELETE FROM user_download_stats WHERE stat_date < ?', [startOfMonthStr]);
        console.log(`✅ [DB Janitor] 过期配额清理完成，共物理粉碎了 ${result.affectedRows} 条历史记录！`);
    }
    catch (error) {
        console.error("❌ [DB Janitor] 清理过期配额时发生异常:", error);
    }
});
