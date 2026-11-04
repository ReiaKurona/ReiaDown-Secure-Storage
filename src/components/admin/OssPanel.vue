<template>
    <div class="panel">
      <div class="panel-header"><h2>OSS 对象存储</h2><div style="flex-grow: 1;"></div><md-filled-button @click="openOssDialog()"><md-icon slot="icon">add</md-icon> 新增配置</md-filled-button></div>
      <div class="table-container md-elevation-1">
        <table class="md3-table">
          <thead><tr><th>配置名称</th><th>服务商</th><th>地域</th><th>Bucket</th><th>属性</th><th width="160">操作</th></tr></thead>
          <tbody>
            <tr v-for="oss in ossList" :key="oss.id">
              <td style="font-weight: bold;">{{ oss.name }}</td><td><span class="tag-chip">{{ oss.provider.toUpperCase() }}</span></td><td>{{ oss.region }}</td><td>{{ oss.bucket }}</td>
              <td><span v-if="oss.is_public" style="color: #4CAF50; font-weight: bold; font-size: 0.8rem;">公共读写</span><span v-else style="color: #FF9800; font-weight: bold; font-size: 0.8rem;">私密防护</span></td>
              <td><div class="action-btns"><md-icon-button @click="testOss(oss)" title="测试"><md-icon>offline_bolt</md-icon></md-icon-button><md-icon-button @click="openOssDialog(oss)"><md-icon>edit</md-icon></md-icon-button><md-icon-button @click="deleteOss(oss.id)" style="color: #ff5252;"><md-icon>delete</md-icon></md-icon-button></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <md-dialog :open="ossDialogOpen" @closed="ossDialogOpen = false">
        <div slot="headline">{{ ossForm.id ? '编辑' : '新增' }} OSS 存储配置</div>
        <div slot="content" class="dialog-form-safe">
          <md-outlined-text-field label="配置标识" .value="ossForm.name" @input="ossForm.name = $event.target.value"></md-outlined-text-field>
          <div style="display: flex; gap: 16px; margin-top: 8px;"><label><input type="radio" v-model="ossForm.provider" value="s3"> 通用 S3</label><label><input type="radio" v-model="ossForm.provider" value="aliyun"> 阿里云</label><label><input type="radio" v-model="ossForm.provider" value="tencent"> 腾讯云</label></div>
          <md-outlined-text-field label="Endpoint" .value="ossForm.endpoint" @input="ossForm.endpoint = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field label="所属地域 Region" .value="ossForm.region" @input="ossForm.region = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field label="Bucket" .value="ossForm.bucket" @input="ossForm.bucket = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field label="Access Key" .value="ossForm.access_key" @input="ossForm.access_key = $event.target.value"></md-outlined-text-field>
          <md-outlined-text-field label="Secret Key" .value="ossForm.secret_key" @input="ossForm.secret_key = $event.target.value"></md-outlined-text-field>
        </div>
        <div slot="actions"><md-text-button @click="ossDialogOpen = false">取消</md-text-button><md-outlined-button @click="testOss(ossForm)" style="margin-right: auto;"><md-icon slot="icon">offline_bolt</md-icon> 测试连通性</md-outlined-button><md-filled-button @click="submitOss">确认保存</md-filled-button></div>
      </md-dialog>
    </div>
  </template>
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { useAppStore } from '../../store';
  const store = useAppStore();
  const ossList = ref<any[]>([]); const ossDialogOpen = ref(false); const ossForm = ref({ id: null, name: '', provider: 's3', endpoint: '', region: '', bucket: '', access_key: '', secret_key: '', is_public: false });
  const fetchOss = async () => { const res = await fetch('/api/admin/oss'); const data = await res.json(); if (data.success) ossList.value = data.configs; };
  const openOssDialog = (item: any = null) => { ossForm.value = item ? { ...item, is_public: !!item.is_public } : { id: null, name: '', provider: 's3', endpoint: '', region: '', bucket: '', access_key: '', secret_key: '', is_public: false }; ossDialogOpen.value = true; };
  const testOss = async (configData: any) => { store.showAlert("测试中", "连接中..."); try { const res = await fetch('/api/admin/oss/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configData) }); const data = await res.json(); store.showAlert(data.success ? "✅ 成功" : "❌ 失败", data.message); } catch (_e) { store.showAlert("错误", "请求失败"); } };
  const submitOss = async () => { const isEdit = !!ossForm.value.id; await fetch(isEdit ? `/api/admin/oss/${ossForm.value.id}` : '/api/admin/oss', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ossForm.value) }); ossDialogOpen.value = false; fetchOss(); };
  const deleteOss = async (id: number) => { if (confirm("确定删除？")) { await fetch(`/api/admin/oss/${id}`, { method: 'DELETE' }); fetchOss(); } };
  onMounted(fetchOss);
  </script>
  <style scoped>@import './admin-shared.css';</style>