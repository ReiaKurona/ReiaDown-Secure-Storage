// public/sw.js
// 🌟 严格单块即时交付 + N+1就绪彻底休息 + 播放推进精准唤醒流媒体引擎 🌟

const MEMORY_MANIFESTS = new Map();
const STREAM_STATES = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// 1. IndexedDB 固化元数据 (保证休眠唤醒不丢失参数)
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('e2ee_streaming_vault', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('manifests')) {
        db.createObjectStore('manifests', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistManifest(id, manifest) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('manifests', 'readwrite');
      tx.objectStore('manifests').put({
        id,
        file_size: manifest.file_size,
        chunk_size: manifest.chunk_size,
        urls: manifest.urls,
        encrypt_key: manifest.encrypt_key,
        mime_type: manifest.mime_type
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

async function restoreManifest(id) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('manifests', 'readonly');
      const req = tx.objectStore('manifests').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function importKey(keyBase64) {
  const binaryString = atob(keyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

const yieldToRenderer = () => new Promise(r => setTimeout(r, 0));

// 2. 接收注册与注销
self.addEventListener('message', async (event) => {
  if (event.data.type === 'REGISTER_STREAM') {
    const { id, manifest } = event.data;
    try {
      manifest.cryptoKey = await importKey(manifest.encrypt_key);
    } catch (e) {}

    MEMORY_MANIFESTS.set(id, manifest);
    await persistManifest(id, manifest);

    STREAM_STATES.set(id, {
      activeChunk: 0,             // 播放器当前正在读的块 (N)
      chunkCache: new Map(),      // 内存池：严格只存 [当前块N, 预备块N+1]
      currentInFlight: null,      // 全局严格仅 1 块在飞: { chunkIdx, promise, controller }
      speedBps: 2.5 * 1024 * 1024
    });

    event.ports[0].postMessage({ success: true });
  } else if (event.data.type === 'CLOSE_STREAM') {
    const id = event.data.id;
    const state = STREAM_STATES.get(id);
    if (state?.currentInFlight?.controller) {
      state.currentInFlight.controller.abort();
    }
    MEMORY_MANIFESTS.delete(id);
    STREAM_STATES.delete(id);
  }
});

// 3. 拦截虚拟流请求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes('/e2ee-stream/')) return;

  const streamId = url.pathname.split('/').pop();
  event.respondWith(handleStreamDispatch(event.request, streamId));
});

async function handleStreamDispatch(request, streamId) {
  let manifest = MEMORY_MANIFESTS.get(streamId);
  if (!manifest) {
    manifest = await restoreManifest(streamId);
    if (manifest) {
      manifest.cryptoKey = await importKey(manifest.encrypt_key);
      MEMORY_MANIFESTS.set(streamId, manifest);
    }
  }

  if (!manifest) {
    return new Response('Stream Expired or Not Found', { status: 404 });
  }

  if (!STREAM_STATES.has(streamId)) {
    STREAM_STATES.set(streamId, {
      activeChunk: 0,
      chunkCache: new Map(),
      currentInFlight: null,
      speedBps: 2.5 * 1024 * 1024
    });
  }

  return await handleAdaptiveRangeRequest(request, streamId, manifest);
}

// 🌟 4. 单块拉取与解密 (纯独立 Promise，谁先到位谁立刻释放，绝不互相拖累)
async function fetchAndDecryptSingleChunk(streamId, chunkIdx, manifest) {
  const state = STREAM_STATES.get(streamId);
  if (!state) throw new Error('State disposed');

  // 1. 命中内存缓存：0ms 交付
  if (state.chunkCache.has(chunkIdx)) {
    return state.chunkCache.get(chunkIdx);
  }

  // 2. 复用在飞 Promise
  if (state.currentInFlight && state.currentInFlight.chunkIdx === chunkIdx) {
    return await state.currentInFlight.promise;
  }

  // 3. 回拉熔断：如果正在下载其他远端块，而当前需要此块，立刻掐断旧任务
  if (state.currentInFlight) {
    state.currentInFlight.controller.abort();
    state.currentInFlight = null;
  }

  const controller = new AbortController();
  const taskPromise = (async () => {
    let retries = 3;
    let encryptedBuf = null;

    while (retries >= 0) {
      try {
        const startTime = performance.now();
        const url = manifest.urls[chunkIdx];
        if (!url) throw new Error(`Chunk ${chunkIdx} out of bounds`);

        // 🌟 强力击穿磁盘缓存，绝不写盘
        const res = await fetch(url, {
          signal: controller.signal,
          cache: 'reload',
          headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
          }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        encryptedBuf = await res.arrayBuffer();

        // 测速记录
        const durationMs = performance.now() - startTime;
        if (durationMs > 0 && encryptedBuf.byteLength > 0) {
          const spd = (encryptedBuf.byteLength / durationMs) * 1000;
          state.speedBps = 0.7 * spd + 0.3 * state.speedBps;
        }
        break;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (retries === 0) throw err;
        retries--;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await yieldToRenderer();

    // 硬件级 AES-GCM 解密
    const iv = encryptedBuf.slice(0, 12);
    const cipher = encryptedBuf.slice(12);
    const key = manifest.cryptoKey || (await importKey(manifest.encrypt_key));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, cipher);
    const resultBytes = new Uint8Array(decrypted);

    encryptedBuf = null; // 释放密文内存引用

    // 写入内存池
    state.chunkCache.set(chunkIdx, resultBytes);

    // 🌟 彻底释放旧块：严格只留 [当前块, 下一块]，历史块立即彻底删除释放内存！
    for (const [cachedIdx] of state.chunkCache) {
      if (cachedIdx < state.activeChunk || cachedIdx > state.activeChunk + 1) {
        state.chunkCache.delete(cachedIdx);
      }
    }

    state.currentInFlight = null;

    // 🌟 下载完当前块后，尝试异步预拉下一块 (静默进行，完全不卡当前块交付)
    scheduleLookaheadOnce(streamId, chunkIdx + 1, manifest);

    return resultBytes;
  })();

  state.currentInFlight = { chunkIdx, promise: taskPromise, controller };
  return await taskPromise;
}

// 🌟 5. 预备块调度：“N+1到位发现充足立即休息”
function scheduleLookaheadOnce(streamId, nextIdx, manifest) {
  const state = STREAM_STATES.get(streamId);
  if (!state || nextIdx >= manifest.urls.length) return;

  // 严格边界：只预备第 activeChunk + 1 块，多一块都不下！
  if (nextIdx > state.activeChunk + 1) return;
  if (state.currentInFlight) return;
  
  // 🌟 核心要求：“第二块到位发现预留充足休息”！如果 N+1 已经在内存，直接停机，零网络！
  if (state.chunkCache.has(nextIdx)) return;

  // 在后台静默预拉取，不阻塞主流程
  fetchAndDecryptSingleChunk(streamId, nextIdx, manifest).catch(() => {});
}

// 🌟 6. Range 请求处理：单块严格截断 + 0秒等待即刻交付
async function handleAdaptiveRangeRequest(request, streamId, manifest) {
  try {
    const state = STREAM_STATES.get(streamId);
    const rangeHeader = request.headers.get('Range') || 'bytes=0-';
    const fileSize = manifest.file_size;
    const chunkSize = manifest.chunk_size || 10485760;

    let [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    let start = parseInt(startStr, 10) || 0;

    if (start >= fileSize) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` }
      });
    }

    const startChunkIdx = Math.floor(start / chunkSize);

    // 🌟 核心杀手锏：无论浏览器 Range 要多大的范围，本次响应严格锁定在当前分块末尾！
    // 彻底消灭“跨块等待”！保证永远只等分块 N，拿到分块 N 瞬间 206 交付给浏览器！
    const chunkEndByte = Math.min((startChunkIdx + 1) * chunkSize - 1, fileSize - 1);
    const actualEnd = endStr ? Math.min(parseInt(endStr, 10), chunkEndByte) : chunkEndByte;

    // 🌟 同步当前播放游标：此时 N+1 晋升为了 N
    if (state) {
      state.activeChunk = startChunkIdx;
    }

    // 仅等待当前这个分块（到位立刻出货，不用管下一块）
    const chunkBytes = await fetchAndDecryptSingleChunk(streamId, startChunkIdx, manifest);

    // 裁剪本分块内对应的字节区间
    const baseOffset = startChunkIdx * chunkSize;
    const sliceStart = start - baseOffset;
    const sliceEnd = sliceStart + (actualEnd - start) + 1;
    const finalData = chunkBytes.slice(sliceStart, sliceEnd);

    // 🌟 响应 206，播放器立即收到分块 N 开始播放！
    return new Response(finalData, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${actualEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': finalData.length.toString(),
        'Content-Type': manifest.mime_type || 'video/mp4',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (e) {
    // 遇到取消或回拖时返回 499 静默等待，绝不返回 404/500 导致播放器崩溃
    return new Response(null, { status: 499 });
  }
}