<template>
  <md-dialog :open="dialogOpen" @closed="dialogOpen = false">
    <div slot="headline">{{ form.id ? '编辑' : '新建' }}{{ form.type === 'folder' ? '文件夹' : '资源' }}</div>
    <div slot="content" class="dialog-form-safe">
      <div class="upload-mode" v-if="!form.id"><label><input type="radio" v-model="form.type" value="file"> 📦 文件</label><label><input type="radio" v-model="form.type" value="folder"> 📁 文件夹</label></div>
      <md-outlined-text-field label="资源名称 (必填)" .value="form.name" @input="form.name = $event.target.value"></md-outlined-text-field>
      <md-outlined-text-field v-if="form.type === 'file'" label="分类标签 (多标签用逗号分隔)" .value="form.tags" @input="form.tags = $event.target.value"></md-outlined-text-field>

      <template v-if="form.type === 'file' && !form.id">
        <div class="upload-mode" style="margin-top: 8px;"><label><input type="radio" v-model="uploadMode" value="link"> 外部直链</label><label><input type="radio" v-model="uploadMode" value="oss"> OSS 极速多核切片直传</label></div>
        <md-outlined-text-field v-if="uploadMode === 'link'" label="下载链接" .value="form.link" @input="form.link = $event.target.value"></md-outlined-text-field>
        <div v-if="uploadMode === 'oss'" class="oss-upload-box">
          <select v-model="form.oss_id" class="modern-select"><option :value="null" disabled>-- 请选择目标 OSS 服务器 --</option><option v-for="oss in ossList" :key="oss.id" :value="oss.id">{{ oss.name }} ({{ oss.provider }})</option></select>
          <label class="encrypt-switch"><input type="checkbox" v-model="form.is_encrypted"><span>启用前端 AES-GCM 金融级切片加密传输</span></label>
          <input type="file" @change="handleFileSelect" class="file-input" id="filePicker"><label for="filePicker" class="file-label"><md-icon>upload_file</md-icon> <span class="truncate-text" style="max-width: 100%;">{{ selectedFile ? selectedFile.name : '点击选择要上传的大文件' }}</span></label>
          <div v-if="selectedFile" style="font-size: 0.8rem; color: gray; text-align: center;">大小: {{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB</div>
          <div v-if="isUploading" class="upload-progress"><div class="progress-text">{{ uploadStatusText }} <span style="float: right;">{{ uploadProgress }}%</span></div><div class="progress-bar"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div></div>
        </div>
      </template>

      <template v-else-if="form.id && form.type === 'file'">
        <md-outlined-text-field v-if="!form.oss_id" label="下载链接" .value="form.link" @input="form.link = $event.target.value"></md-outlined-text-field>
        <div v-if="form.oss_id" class="security-tip"><md-icon style="vertical-align: middle; margin-right: 8px;">verified_user</md-icon> 云端哈希切片加密资源。仅允许修改名称和标签。</div>
      </template>
    </div>
    <div slot="actions"><md-text-button @click="dialogOpen = false" :disabled="isUploading">取消</md-text-button><md-filled-button @click="submitAction" :disabled="isUploading">{{ isUploading ? '处理中...' : '保存并提交' }}</md-filled-button></div>
  </md-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from '../../store'; // 修复的正确路径

const props = defineProps<{ parentId: number }>();
const emit = defineEmits(['refresh']);
const store = useAppStore();

const dialogOpen = ref(false);
const form = ref({ id: null, parent_id: 0, type: 'file', name: '', tags: '', link: '', oss_id: null, is_encrypted: true, encrypt_key: '', object_key: '', file_size: 0, total_chunks: 1 });
const ossList = ref<any[]>([]); const uploadMode = ref('oss'); const selectedFile = ref<File | null>(null); const isUploading = ref(false); const uploadProgress = ref(0); const uploadStatusText = ref('');

onMounted(async () => {
  const res = await fetch('/api/admin/oss'); const data = await res.json(); if (data.success) ossList.value = data.configs;
});

const openAdd = () => { form.value = { id: null, parent_id: props.parentId, type: 'file', name: '', tags: '', link: '', oss_id: null, is_encrypted: true, encrypt_key: '', object_key: '', file_size: 0, total_chunks: 1 }; selectedFile.value = null; uploadMode.value = 'oss'; isUploading.value = false; uploadProgress.value = 0; dialogOpen.value = true; };
const openEdit = (item: any) => { if (item.oss_id) return store.showAlert("提示", "云端加密文件请进入【管理控制台】操作。"); form.value = { ...item }; dialogOpen.value = true; };
defineExpose({ openAdd, openEdit }); // 暴露给父组件调用

const handleFileSelect = (e: any) => { if (e.target.files.length > 0) { selectedFile.value = e.target.files[0]; if (!form.value.name) form.value.name = selectedFile.value!.name; } };

const uploadChunkToOSS = (url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('PUT', url, true); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('上传失败')); };
    xhr.onerror = () => reject(new Error('网络错误')); xhr.send(blob);
  });
};

const submitAction = async () => {
  if (!form.value.name.trim()) return store.showAlert("提示", "资源名称必填");
  if (form.value.type === 'file' && uploadMode.value === 'oss' && !form.value.id) {
    if (!form.value.oss_id || !selectedFile.value) return store.showAlert("提示", "请选择 OSS 和文件");
    isUploading.value = true;
    try {
      const CHUNK_SIZE = 10 * 1024 * 1024; const file = selectedFile.value; const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
      form.value.file_size = file.size; form.value.total_chunks = totalChunks;

      let encryptionKey: CryptoKey | null = null;
      if (form.value.is_encrypted) {
        uploadStatusText.value = '🔑 动态加载安全模块...';
        // 🌟 动态异步加载加密模块，极大减小首屏体积 🌟
        const { generateEncryptionKey } = await import('../../utils/crypto');
        const { key, keyBase64 } = await generateEncryptionKey(); encryptionKey = key; form.value.encrypt_key = keyBase64;
      } else { form.value.encrypt_key = ''; }

      uploadStatusText.value = '☁️ 申请云端分布式上传授权...';
      const presignRes = await fetch('/api/admin/oss/chunk_upload/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oss_id: form.value.oss_id, total_chunks: totalChunks }) });
      const presignData = await presignRes.json();
      if (!presignData.success) throw new Error(presignData.message);
      
      form.value.object_key = presignData.objectKey; const uploadUrls = presignData.uploadUrls;
      
      const chunksLoadedBytes = new Array(totalChunks).fill(0); const totalBytesToUpload = file.size + (form.value.is_encrypted ? totalChunks * 28 : 0);
      let currentChunkIndex = 0; let completedChunks = 0; const concurrency = Math.min(8, navigator.hardwareConcurrency || 4);

      const uploadWorker = async () => {
        while (currentChunkIndex < totalChunks) {
          const i = currentChunkIndex++; const start = i * CHUNK_SIZE; const end = Math.min(start + CHUNK_SIZE, file.size); const chunkBlob = file.slice(start, end);
          let targetBlob = chunkBlob; 
          if (encryptionKey) {
            const { encryptFile } = await import('../../utils/crypto'); // 动态引入
            targetBlob = await encryptFile(chunkBlob, encryptionKey);
          }
          await uploadChunkToOSS(uploadUrls[i], targetBlob, (loadedBytes) => { chunksLoadedBytes[i] = loadedBytes; const globalLoaded = chunksLoadedBytes.reduce((a, b) => a + b, 0); uploadProgress.value = Math.min(99, Math.round((globalLoaded / totalBytesToUpload) * 100)); uploadStatusText.value = `🚀 多线程直传 (${completedChunks}/${totalChunks}) ${uploadProgress.value}%`; });
          completedChunks++;
        }
      };

      const workers = []; for(let w = 0; w < Math.min(concurrency, totalChunks); w++) { workers.push(uploadWorker()); }
      await Promise.all(workers); uploadProgress.value = 100;
    } catch (e: any) { isUploading.value = false; return store.showAlert("上传异常", e.message); }
  }

  uploadStatusText.value = '💾 保存元数据...';
  const isEdit = !!form.value.id;
  await fetch(isEdit ? `/api/admin/resources/${form.value.id}` : `/api/admin/resources`, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) });
  isUploading.value = false; dialogOpen.value = false; emit('refresh'); store.showAlert("成功", "资源保存成功！");
};
</script>

<style scoped>
.dialog-form-safe { display: flex; flex-direction: column; gap: 16px; padding: 8px 4px 16px; min-width: 300px; }
@media (min-width: 600px) { .dialog-form-safe { min-width: 450px; } }
md-outlined-text-field { width: 100%; }
.upload-mode { display: flex; gap: 16px; background: var(--md-sys-color-surface-variant); padding: 12px 16px; border-radius: 12px; font-weight: bold; flex-wrap: wrap;}
.oss-upload-box { border: 1px dashed var(--md-sys-color-outline); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 16px; background: rgba(0,0,0,0.02); }
.modern-select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--md-sys-color-outline); background: var(--md-sys-color-surface); font-size: 1rem; color: var(--md-sys-color-on-surface); outline: none; }
.encrypt-switch { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; font-weight: bold; color: #2E7D32; cursor: pointer; }
.encrypt-switch input { width: 18px; height: 18px; }
.file-input { display: none; }
.file-label { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); border-radius: 12px; cursor: pointer; transition: opacity 0.2s; font-weight: bold; text-align: center; border: 2px dashed transparent; }
.file-label:hover { opacity: 0.8; border-color: var(--md-sys-color-primary); }
.file-label md-icon { font-size: 40px; }
.upload-progress { margin-top: 8px; }
.progress-text { font-size: 0.9rem; margin-bottom: 8px; font-weight: bold; color: var(--md-sys-color-primary); }
.progress-bar { width: 100%; height: 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--md-sys-color-primary); transition: width 0.1s linear; }
.security-tip { background: #E8F5E9; color: #1B5E20; padding: 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 500; text-align: left; line-height: 1.5; margin-top: 8px; }
</style>