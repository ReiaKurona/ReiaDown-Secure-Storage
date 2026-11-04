// public/sw.js
// 🌟 前端虚拟流媒体服务器：拦截 Range 请求，精准分块解密 🌟

const manifestStore = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// 接收来自 Dashboard 的解密凭证
self.addEventListener('message', (event) => {
  if (event.data.type === 'REGISTER_STREAM') {
    manifestStore.set(event.data.id, event.data.manifest);
    event.ports[0].postMessage({ success: true });
  }
});

// 解密核心引擎 (运行在独立线程)
async function importKey(keyBase64) {
  const binaryString = atob(keyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/e2ee-stream/')) return;

  const streamId = url.pathname.split('/').pop();
  const manifest = manifestStore.get(streamId);
  if (!manifest) return event.respondWith(new Response('Not Found', { status: 404 }));

  // 🌟 核心：处理视频播放器的断点续传 (Range) 🌟
  event.respondWith(handleRangeRequest(event.request, manifest));
});

async function handleRangeRequest(request, manifest) {
  try {
    const rangeHeader = request.headers.get('Range') || 'bytes=0-';
    const fileSize = manifest.file_size;
    const chunkSize = 10 * 1024 * 1024; // 10MB 明文分块

    let [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    let start = parseInt(startStr, 10) || 0;
    // 每次最多预加载 10MB 数据，防止内存爆炸，实现真正的“看一块下一块”
    let end = endStr ? parseInt(endStr, 10) : Math.min(start + chunkSize - 1, fileSize - 1);
    
    if (start >= fileSize) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });

    // 计算需要请求哪几个加密的碎块
    const startChunkIdx = Math.floor(start / chunkSize);
    const endChunkIdx = Math.floor(end / chunkSize);

    const key = await importKey(manifest.encrypt_key);
    let decryptedBuffers = [];

    // 🌟 配合 request.signal，一旦用户关掉播放器，立刻中止 Fetch 下载，彻底释放网络与内存！
    for (let i = startChunkIdx; i <= endChunkIdx; i++) {
      const chunkRes = await fetch(manifest.urls[i], { signal: request.signal });
      const encryptedBuffer = await chunkRes.arrayBuffer();
      
      const iv = encryptedBuffer.slice(0, 12);
      const cipherBuffer = encryptedBuffer.slice(12);
      const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuffer);
      decryptedBuffers.push(new Uint8Array(decryptedBuffer));
    }

    // 重组并精准裁剪出播放器要求的字节段
    const totalLength = decryptedBuffers.reduce((acc, val) => acc + val.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of decryptedBuffers) { combined.set(buf, offset); offset += buf.length; }

    const sliceStart = start % chunkSize;
    const sliceEnd = sliceStart + (end - start) + 1;
    const finalData = combined.slice(sliceStart, sliceEnd);

    // 伪装成真实的视频服务器响应
    return new Response(finalData, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': finalData.length.toString(),
        'Content-Type': manifest.mime_type || 'video/mp4'
      }
    });
  } catch (e) {
    if (e.name === 'AbortError') console.log('用户关闭播放器，串流下载已瞬间熔断终止！');
    return new Response('Stream Error', { status: 500 });
  }
}