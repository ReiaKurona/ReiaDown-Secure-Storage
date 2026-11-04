/**
 * 前端 Web Crypto API 金融级加密引擎 (AES-GCM)
 */

// 1. 生成随机的 AES-256-GCM 密钥，并导出为 Base64 字符串以便保存到数据库
export const generateEncryptionKey = async (): Promise<{ key: CryptoKey; keyBase64: string }> => {
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // 允许导出
    ["encrypt", "decrypt"]
  );
  
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return { key, keyBase64 };
};

// 2. 从 Base64 字符串恢复密钥 (供下载解密使用)
export const importEncryptionKey = async (keyBase64: string): Promise<CryptoKey> => {
  const binaryString = atob(keyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
};

// 3. 加密文件 (IV + 密文 拼接)
export const encryptFile = async (file: Blob, key: CryptoKey): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // AES-GCM 需要一个 12 字节的随机初始化向量 (IV)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // 核心加密过程
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );
  
  // 将 IV 前置拼接在密文最前面，方便解密时提取
  return new Blob([iv, cipherBuffer], { type: "application/octet-stream" });
};

// 4. 解密文件
export const decryptFile = async (encryptedBlob: Blob, key: CryptoKey, originalType: string): Promise<Blob> => {
  const arrayBuffer = await encryptedBlob.arrayBuffer();
  
  // 提取前 12 字节作为 IV
  const iv = arrayBuffer.slice(0, 12);
  // 提取剩余部分作为真实的密文
  const cipherBuffer = arrayBuffer.slice(12);
  
  // 核心解密过程
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    cipherBuffer
  );
  
  return new Blob([decryptedBuffer], { type: originalType });
};



// 5. 动态会话密钥生成：将 JWT Token 转为 AES-256 会话密钥
const deriveSessionKey = async (token: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(token);
  // 用 SHA-256 散列 Token 得到 32字节 (256位) 的定长材料
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', tokenData);
  
  // 导入为 AES-GCM 密钥
  return await window.crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
};

// 6. 前端内存级 API 数据解密
export const decryptApiPayload = async (encryptedPackage: any, token: string): Promise<any> => {
  try {
    const sessionKey = await deriveSessionKey(token);
    
    // 将后端的 Base64 参数全部还原为二进制 Uint8Array
    const ivBytes = Uint8Array.from(atob(encryptedPackage.iv), c => c.charCodeAt(0));
    const tagBytes = Uint8Array.from(atob(encryptedPackage.tag), c => c.charCodeAt(0));
    const dataBytes = Uint8Array.from(atob(encryptedPackage.data), c => c.charCodeAt(0));
    
    // 拼接密文和认证标签 (AES-GCM 标准要求)
    const cipherBuffer = new Uint8Array(dataBytes.length + tagBytes.length);
    cipherBuffer.set(dataBytes, 0);
    cipherBuffer.set(tagBytes, dataBytes.length);

    // 硬件级瞬间解密
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      sessionKey,
      cipherBuffer
    );

    // 还原为原本的明文 JSON 并解析
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonStr);

  } catch (error) {
    console.error("API 数据解密失败，会话可能已失效被篡改:", error);
    throw new Error("元数据通道安全校验失败");
  }
};