"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerAllSyncs = exports.runGithubSyncTask = void 0;
const db_1 = require("./db");
const client_s3_1 = require("@aws-sdk/client-s3");
const crypto_1 = __importDefault(require("crypto"));
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB 分块
// 🌟 Node.js 端到端兼容加密引擎 (与前端 WebCrypto 100% 格式对齐)
const encryptChunkNode = (buffer, key) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, tag]);
};
// 确保或创建目录资源，返回目录 ID
const ensureFolder = async (name, parentId) => {
    const [rows] = await db_1.newPool.execute('SELECT id FROM resources WHERE name = ? AND parent_id = ? AND type = "folder" LIMIT 1', [name, parentId]);
    if (rows.length > 0)
        return rows[0].id;
    const [result] = await db_1.newPool.execute('INSERT INTO resources (parent_id, type, name) VALUES (?, "folder", ?)', [parentId, name]);
    return result.insertId;
};
// 执行单个 GitHub 同步任务
const runGithubSyncTask = async (task) => {
    console.log(`\n[GitHub Sync] 正在巡检仓库: ${task.repo_name}`);
    try {
        // 1. 获取 GitHub Latest Release
        const res = await fetch(`https://api.github.com/repos/${task.repo_name}/releases/latest`, {
            headers: { 'User-Agent': 'NodeJS-E2EE-Sync-Agent' } // GitHub 要求必须有 UA
        });
        if (!res.ok) {
            if (res.status === 403 || res.status === 429)
                throw new Error("触发 GitHub API 速率限制 (Rate Limit)，请稍后再试");
            throw new Error(`获取仓库信息失败: HTTP ${res.status}`);
        }
        const release = await res.json();
        if (release.tag_name === task.last_version) {
            console.log(`[GitHub Sync] 仓库 ${task.repo_name} 无新版本 (${task.last_version})，跳过。`);
            return;
        }
        console.log(`[GitHub Sync] 发现新版本: ${release.tag_name}，启动加密搬运管线...`);
        // 2. 获取 OSS 配置
        const [ossRows] = await db_1.newPool.execute('SELECT * FROM oss_configs WHERE id = ?', [task.oss_id]);
        if (ossRows.length === 0)
            throw new Error("OSS配置不存在");
        const oss = ossRows[0];
        const client = new client_s3_1.S3Client({
            region: oss.region || 'us-east-1',
            endpoint: oss.endpoint.startsWith('http') ? oss.endpoint : `https://${oss.endpoint}`,
            credentials: { accessKeyId: oss.access_key, secretAccessKey: oss.secret_key }
        });
        // 3. 构建目录结构: [父目录] -> [仓库名] -> [版本号]
        const repoNameClean = task.repo_name.split('/').pop() || task.repo_name;
        const repoFolderId = await ensureFolder(repoNameClean, task.parent_folder_id);
        const versionFolderId = await ensureFolder(release.tag_name, repoFolderId);
        // 4. 遍历并下载所有附件
        for (const asset of release.assets) {
            console.log(`  - 正在搬运: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`);
            const assetRes = await fetch(asset.browser_download_url);
            if (!assetRes.ok || !assetRes.body) {
                console.error(`  ❌ 无法建立下载流: ${asset.name}`);
                continue;
            }
            // 生成专属 AES-256 密钥与随机哈希目录
            const aesKey = crypto_1.default.randomBytes(32);
            const keyBase64 = aesKey.toString('base64');
            const hashDir = `encrypted_vault/gh_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            let chunkIndex = 0;
            // 🌟 核心重构：零内存泄漏的流式缓冲池 (Buffer Queue) 🌟
            const bufferArray = [];
            let currentBufferLength = 0;
            const reader = assetRes.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    bufferArray.push(value);
                    currentBufferLength += value.length;
                }
                // 当缓冲池里积攒够了 10MB，或者文件已经读到末尾且还有残余数据时，切下一块进行加密上传
                while (currentBufferLength >= CHUNK_SIZE || (done && currentBufferLength > 0)) {
                    const processSize = currentBufferLength >= CHUNK_SIZE ? CHUNK_SIZE : currentBufferLength;
                    // 精准抽取 10MB 物理内存，避免无意义的整体 concat 导致崩溃
                    const chunkBuffer = Buffer.allocUnsafe(processSize);
                    let offset = 0;
                    while (offset < processSize) {
                        const first = bufferArray[0];
                        const take = Math.min(first.length, processSize - offset);
                        Buffer.from(first.buffer, first.byteOffset, take).copy(chunkBuffer, offset);
                        offset += take;
                        // 及时清理已经抽空的队列元素，完美释放内存
                        if (take === first.length) {
                            bufferArray.shift();
                        }
                        else {
                            bufferArray[0] = first.subarray(take);
                        }
                    }
                    currentBufferLength -= processSize;
                    // 加密与直传 OSS
                    const encryptedPayload = encryptChunkNode(chunkBuffer, aesKey);
                    const chunkKey = `${hashDir}/${hashDir.split('/')[1]}_chunk_${chunkIndex}.bin`;
                    await client.send(new client_s3_1.PutObjectCommand({
                        Bucket: oss.bucket,
                        Key: chunkKey,
                        Body: encryptedPayload,
                        ContentType: 'application/octet-stream'
                    }));
                    console.log(`    ⬆️ 分块 [${chunkIndex}] 加密落盘完毕`);
                    chunkIndex++;
                }
                if (done)
                    break;
            }
            // 5. 保存资产元数据到数据库
            await db_1.newPool.execute(`INSERT INTO resources (parent_id, type, name, tags, oss_id, object_key, is_encrypted, encrypt_key, file_size, total_chunks) 
                VALUES (?, 'file', ?, 'GitHub同步', ?, ?, 1, ?, ?, ?)`, [versionFolderId, asset.name, task.oss_id, hashDir, keyBase64, asset.size, chunkIndex]);
            console.log(`  ✅ 附件 ${asset.name} 极速加密同步完成！`);
        }
        // 6. 更新任务的最后同步版本
        await db_1.newPool.execute('UPDATE github_tasks SET last_version = ? WHERE id = ?', [release.tag_name, task.id]);
        // 🌟 7. 执行历史版本生命周期管理 (Retention Policy) 🌟
        const retentionLimit = task.retention_limit || 3;
        // 查找该仓库目录下的所有版本文件夹（按时间倒序）
        const [historyRows] = await db_1.newPool.execute('SELECT id, name FROM resources WHERE parent_id = ? AND type = "folder" ORDER BY created_at DESC', [repoFolderId]);
        if (historyRows.length > retentionLimit) {
            // 截取超出保留数量的陈旧版本
            const outdatedVersions = historyRows.slice(retentionLimit);
            for (const oldVer of outdatedVersions) {
                console.log(`[GitHub Sync] 触发保留策略，正在销毁过期版本: ${oldVer.name}`);
                // 内部调用 Node.js 环境发起 HTTP DELETE 请求，触发我们的递归删除 API
                // 这样可以复用后端完整的云端 OSS 碎片销毁逻辑
                try {
                    await fetch(`http://localhost:${process.env.PORT || 5000}/api/admin/resources/${oldVer.id}`, { method: 'DELETE' });
                }
                catch (e) {
                    console.error("  ❌ 清理老版本失败:", e);
                }
            }
        }
        console.log(`🎉 [GitHub Sync] 仓库 ${task.repo_name} (${release.tag_name}) 搬运与清理完毕！\n`);
    }
    catch (e) {
        console.error(`❌ [GitHub Sync] 任务异常中断 (${task.repo_name}):`, e.message);
    }
};
exports.runGithubSyncTask = runGithubSyncTask;
const triggerAllSyncs = async () => {
    if (!db_1.newPool)
        return;
    try {
        const [tasks] = await db_1.newPool.execute('SELECT * FROM github_tasks WHERE is_active = 1');
        for (const task of tasks) {
            await (0, exports.runGithubSyncTask)(task);
        }
    }
    catch (e) {
        console.error("批量同步触发失败", e);
    }
};
exports.triggerAllSyncs = triggerAllSyncs;
