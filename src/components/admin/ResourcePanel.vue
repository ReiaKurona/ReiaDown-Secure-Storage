<template>
    <div class="panel">
      <div class="panel-header">
        <h2>资源管理</h2><div style="flex-grow: 1;"></div>
        <md-outlined-button @click="openDialog('folder')"><md-icon slot="icon">create_new_folder</md-icon> 新建文件夹</md-outlined-button>
        <md-filled-button style="margin-left: 12px;" @click="openDialog('file')"><md-icon slot="icon">add_link</md-icon> 添加资源</md-filled-button>
      </div>
      <div class="breadcrumbs">
        <md-text-button @click="navigateTo(0, '根目录')"><md-icon slot="icon">home</md-icon> 根目录</md-text-button>
        <template v-for="(nav, index) in pathHistory" :key="index"><md-icon style="color: gray">chevron_right</md-icon><md-text-button @click="navigateTo(nav.id, nav.name, index)">{{ nav.name }}</md-text-button></template>
      </div>
      <div class="table-container md-elevation-1">
        <table class="md3-table">
          <thead><tr><th width="80">类型</th><th>资源名称</th><th>状态</th><th width="150">操作</th></tr></thead>
          <transition-group name="list-flow" tag="tbody">
            <tr v-for="res in sortedResources" :key="res.id" :draggable="true" @dragstart="onDragStart($event, res)" @dragover.prevent @drop="onDrop($event, res)" class="draggable-row">
              <td><md-icon style="color: var(--md-sys-color-primary);">{{ res.type === 'folder' ? 'folder' : 'draft' }}</md-icon></td>
              <td><a v-if="res.type === 'folder'" href="javascript:void(0)" class="folder-link" @click="enterFolder(res.id, res.name)">{{ res.name }}</a><div v-else><div style="font-weight: 500;">{{ res.name }}</div><div style="font-size: 0.8rem; color: gray;" v-if="res.file_size">{{ (res.file_size / 1024 / 1024).toFixed(2) }} MB</div></div></td>
              <td>
                <span v-if="res.type === 'folder'">-</span>
                <span v-else-if="res.is_encrypted" class="status-chip encrypted"><md-icon style="font-size: 14px;">lock</md-icon> 碎片加密</span>
                <span v-else-if="res.oss_id" class="status-chip public"><md-icon style="font-size: 14px;">public</md-icon> 碎片直传</span>
                <span v-else class="status-chip link"><md-icon style="font-size: 14px;">link</md-icon> 外链</span>
              </td>
              <td><div class="action-btns"><md-icon-button @click="openDialog(res.type, res)"><md-icon>edit</md-icon></md-icon-button><md-icon-button @click="deleteResource(res.id)" style="color: #ff5252;"><md-icon>delete</md-icon></md-icon-button></div></td>
            </tr>
          </transition-group>
        </table>
      </div>
  
      <md-dialog :open="dialogOpen" @closed="dialogOpen = false">
        <div slot="headline">{{ form.id ? '编辑' : '新建' }}{{ form.type === 'folder' ? '文件夹' : '资源' }}</div>
        <div slot="content" class="dialog-form-safe">
          <div class="upload-mode" v-if="!form.id"><label><input type="radio" v-model="form.type" value="file"> 📦 文件</label><label><input type="radio" v-model="form.type" value="folder"> 📁 文件夹</label></div>
          <md-outlined-text-field label="资源名称 (必填)" .value="form.name" @input="form.name = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field v-if="form.type === 'file'" label="分类标签 (多标签用逗号分隔)" .value="form.tags" @input="form.tags = $event.target.value"></md-outlined-text-field>
  
          <template v-if="form.type === 'file' && !form.id">
            <div class="upload-mode" style="margin-top: 8px;"><label><input type="radio" v-model="uploadMode" value="link"> 外部直链</label><label><input type="radio" v-model="uploadMode" value="oss"> OSS 极速并发直传</label></div>
            <md-outlined-text-field v-if="uploadMode === 'link'" label="下载链接" .value="form.link" @input="form.link = $event.target.value"></md-outlined-text-field>
            <div v-if="uploadMode === 'oss'" class="oss-upload-box">
              <select v-model="form.oss_id" class="modern-select"><option :value="null" disabled>-- 请选择目标 OSS 服务器 --</option><option v-for="oss in ossList" :key="oss.id" :value="oss.id">{{ oss.name }} ({{ oss.provider }})</option></select>
              <label class="encrypt-switch"><input type="checkbox" v-model="form.is_encrypted"><span>启用前端 AES-GCM 金融级切片加密传输</span></label>
              <input type="file" @change="handleFileSelect" class="file-input" id="filePicker"><label for="filePicker" class="file-label"><md-icon>upload_file</md-icon> <span class="truncate-text" style="max-width: 100%;">{{ selectedFile ? selectedFile.name : '点击选择大文件' }}</span></label>
              <div v-if="selectedFile" style="font-size: 0.8rem; color: gray; text-align: center;">大小: {{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB</div>
              <div v-if="isUploading" class="upload-progress"><div class="progress-text">{{ uploadStatusText }} <span style="float: right;">{{ uploadProgress }}%</span></div><div class="progress-bar"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div></div>
            </div>
          </template>
          <template v-else-if="form.id && form.type === 'file'">
            <md-outlined-text-field v-if="!form.oss_id" label="下载链接" .value="form.link" @input="form.link = $event.target.value"></md-outlined-text-field>
            <div v-if="form.oss_id" style="margin-top:16px; padding: 16px; background: var(--md-sys-color-surface-variant); border-radius: 12px; color: var(--md-sys-color-on-surface); font-size: 0.9rem;"><md-icon style="vertical-align: middle; margin-right: 8px;">verified_user</md-icon> 云端哈希切片资源。仅允许修改名称和标签。</div>
          </template>
        </div>
        <div slot="actions"><md-text-button @click="dialogOpen = false" :disabled="isUploading">取消</md-text-button><md-filled-button @click="submitResource" :disabled="isUploading">{{ isUploading ? '处理中...' : '保存并提交' }}</md-filled-button></div>
      </md-dialog>
    </div>
  </template>
  <script setup lang="ts">
  import { ref, onMounted, computed } from 'vue';
  import { useAppStore } from '../../store';
  import { generateEncryptionKey, encryptFile } from '../../utils/crypto';
  const store = useAppStore();
  const resources = ref<any[]>([]); const currentParentId = ref(0); const pathHistory = ref<{id: number, name: string}[]>([]); 
  const sortedResources = computed(() => [...resources.value].sort((a, b) => (b.sort_order || b.id) - (a.sort_order || a.id)));
  const dragItem = ref<any>(null);
  const onDragStart = (e: DragEvent, res: any) => { dragItem.value = res; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; };
  const onDrop = async (_e: DragEvent, targetRes: any) => {
    if (!dragItem.value || dragItem.value.id === targetRes.id) return;
    const draggedOrder = dragItem.value.sort_order || dragItem.value.id; const targetOrder = targetRes.sort_order || targetRes.id;
    const draggedIndex = resources.value.findIndex(r => r.id === dragItem.value.id); const targetIndex = resources.value.findIndex(r => r.id === targetRes.id);
    resources.value[draggedIndex].sort_order = targetOrder; resources.value[targetIndex].sort_order = draggedOrder; resources.value = [...resources.value];
    const updates = [ { id: dragItem.value.id, sort_order: targetOrder }, { id: targetRes.id, sort_order: draggedOrder } ];
    dragItem.value = null;
    try { await fetch('/api/admin/resources/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) }); } catch (_err) { store.showAlert("错误", "排序保存失败"); fetchResources(); }
  };
  
  const dialogOpen = ref(false); 
  const form = ref({ id: null, parent_id: 0, type: 'file', name: '', tags: '', link: '', oss_id: null, is_encrypted: true, encrypt_key: '', object_key: '', file_size: 0, total_chunks: 1 });
  const ossList = ref<any[]>([]); const uploadMode = ref('oss'); const selectedFile = ref<File | null>(null); const isUploading = ref(false); const uploadProgress = ref(0); const uploadStatusText = ref('');
  
  const fetchResources = async () => { const res = await fetch(`/api/admin/resources?parentId=${currentParentId.value}`); const data = await res.json(); if (data.success) resources.value = data.resources.map((r: any) => ({ ...r, sort_order: r.sort_order || r.id })); };
  const fetchOss = async () => { const res = await fetch('/api/admin/oss'); const data = await res.json(); if (data.success) ossList.value = data.configs; };
  const enterFolder = (id: number, name: string) => { pathHistory.value.push({ id, name }); currentParentId.value = id; fetchResources(); };
  const navigateTo = (id: number, _name: string, idx: number = -1) => { currentParentId.value = id; pathHistory.value = idx === -1 ? [] : pathHistory.value.slice(0, idx + 1); fetchResources(); };
  const deleteResource = async (id: number) => { if (confirm("确定删除？后台将同步销毁云端关联碎片！")) { await fetch(`/api/admin/resources/${id}`, { method: 'DELETE' }); fetchResources(); } };
  
  const openDialog = (type: string, item: any = null) => { form.value = item ? { ...item } : { id: null, parent_id: currentParentId.value, type, name: '', tags: '', link: '', oss_id: null, is_encrypted: true, encrypt_key: '', object_key: '', file_size: 0, total_chunks: 1 }; selectedFile.value = null; uploadMode.value = 'oss'; isUploading.value = false; uploadProgress.value = 0; dialogOpen.value = true; };
  const handleFileSelect = (e: any) => { if (e.target.files.length > 0) { selectedFile.value = e.target.files[0]; if (!form.value.name) form.value.name = selectedFile.value!.name; } };
  
  const uploadChunkToOSS = (url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('PUT', url, true); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('上传失败')); };
      xhr.onerror = () => reject(new Error('网络错误')); xhr.send(blob);
    });
  };
  
  const submitResource = async () => {
    if (!form.value.name.trim()) return store.showAlert("提示", "名称必填");
    if (form.value.type === 'file' && uploadMode.value === 'oss' && !form.value.id) {
      if (!form.value.oss_id || !selectedFile.value) return store.showAlert("提示", "请选择 OSS 和文件");
      isUploading.value = true;
      try {
        const CHUNK_SIZE = 10 * 1024 * 1024; const file = selectedFile.value; const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
        form.value.file_size = file.size; form.value.total_chunks = totalChunks;
        let encryptionKey: CryptoKey | null = null;
        if (form.value.is_encrypted) { uploadStatusText.value = '🔑 生成专属 AES 密钥...'; const { key, keyBase64 } = await generateEncryptionKey(); encryptionKey = key; form.value.encrypt_key = keyBase64; } else { form.value.encrypt_key = ''; }
  
        uploadStatusText.value = '☁️ 申请云端分布式上传授权...';
        const presignRes = await fetch('/api/admin/oss/chunk_upload/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oss_id: form.value.oss_id, total_chunks: totalChunks }) });
        const presignData = await presignRes.json();
        if (!presignData.success) throw new Error(presignData.message);
        form.value.object_key = presignData.objectKey; const uploadUrls = presignData.uploadUrls;
  
        uploadStatusText.value = `🚀 并发切片直传中 (0/${totalChunks})...`;
        const chunksLoadedBytes = new Array(totalChunks).fill(0); const totalBytesToUpload = file.size + (form.value.is_encrypted ? totalChunks * 28 : 0);
        let currentChunkIndex = 0; let completedChunks = 0; const concurrency = Math.min(8, navigator.hardwareConcurrency || 4);
  
        const uploadWorker = async () => {
          while (currentChunkIndex < totalChunks) {
            const i = currentChunkIndex++; const start = i * CHUNK_SIZE; const end = Math.min(start + CHUNK_SIZE, file.size); const chunkBlob = file.slice(start, end);
            let targetBlob = chunkBlob; if (encryptionKey) targetBlob = await encryptFile(chunkBlob, encryptionKey);
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
    isUploading.value = false; dialogOpen.value = false; fetchResources();
  };
  
  onMounted(() => { fetchResources(); fetchOss(); });
  </script>
  <style scoped>@import './admin-shared.css';</style>