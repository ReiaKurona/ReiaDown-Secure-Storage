<template>
    <div class="panel">
      <div class="panel-header">
        <h2>GitHub 自动同步</h2><div style="flex-grow: 1;"></div>
        <md-filled-button @click="openGithubDialog()"><md-icon slot="icon">add</md-icon> 新增同步任务</md-filled-button>
      </div>
      <p class="desc">后台每 4 小时自动巡检仓库 Latest Release，调用底层引擎加密切片并直传到 OSS。</p>
      
      <div class="table-container md-elevation-1">
        <table class="md3-table">
          <thead><tr><th>仓库地址</th><th>转存目标 OSS</th><th>当前版本</th><th width="100">操作</th></tr></thead>
          <tbody>
            <tr v-for="task in githubTasks" :key="task.id">
              <td style="font-weight: bold;"><md-icon style="font-size: 16px; vertical-align: middle;">code</md-icon> {{ task.repo_name }}</td>
              <td>配置 ID: {{ task.oss_id }}</td>
              <td><span class="status-chip public">{{ task.last_version || '等待首次巡检' }}</span></td>
              <td><md-icon-button @click="deleteGithubTask(task.id)" style="color: #ff5252;"><md-icon>delete</md-icon></md-icon-button></td>
            </tr>
            <tr v-if="githubTasks.length === 0"><td colspan="4" style="text-align: center; padding: 48px;">暂无自动同步任务</td></tr>
          </tbody>
        </table>
      </div>
  
      <md-dialog :open="githubDialogOpen" @closed="githubDialogOpen = false">
        <div slot="headline">新增 GitHub 自动同步任务</div>
        <div slot="content" class="dialog-form-safe">
          <p style="font-size: 0.85rem; color: gray; margin-bottom: 16px;">系统将自动获取 Latest Release 附件并加密搬运。</p>
          <md-outlined-text-field label="GitHub 仓库名 (如: Dreamacro/clash)" .value="githubForm.repo_name" @input="githubForm.repo_name = $event.target.value"></md-outlined-text-field>
          <select v-model="githubForm.oss_id" class="modern-select">
            <option :value="null" disabled>-- 请选择用来接收加密文件的 OSS --</option>
            <option v-for="oss in ossList" :key="oss.id" :value="oss.id">{{ oss.name }}</option>
          </select>
          <md-outlined-text-field type="number" label="保存到的父目录 ID (根目录填 0)" .value="githubForm.parent_folder_id" @input="githubForm.parent_folder_id = parseInt($event.target.value) || 0"></md-outlined-text-field>
        </div>
        <div slot="actions">
          <md-text-button @click="githubDialogOpen = false">取消</md-text-button>
          <md-filled-button @click="submitGithubTask">建立巡检任务</md-filled-button>
        </div>
      </md-dialog>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { useAppStore } from '../../store';
  const store = useAppStore();
  
  const githubTasks = ref<any[]>([]);
  const githubDialogOpen = ref(false);
  const githubForm = ref({ repo_name: '', oss_id: null, parent_folder_id: 0 });
  const ossList = ref<any[]>([]);
  
  const fetchTasks = async () => { const res = await fetch('/api/admin/github-tasks'); const data = await res.json(); if (data.success) githubTasks.value = data.tasks; };
  const fetchOss = async () => { const res = await fetch('/api/admin/oss'); const data = await res.json(); if (data.success) ossList.value = data.configs; };
  
  const openGithubDialog = () => { githubForm.value = { repo_name: '', oss_id: null, parent_folder_id: 0 }; githubDialogOpen.value = true; };
  const submitGithubTask = async () => {
    if (!githubForm.value.repo_name || !githubForm.value.oss_id) return store.showAlert("提示", "仓库名和关联OSS必填");
    try {
      const res = await fetch('/api/admin/github-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(githubForm.value) });
      const data = await res.json();
      if (data.success) { githubDialogOpen.value = false; fetchTasks(); store.showAlert("添加成功", "已放入后台队列，10秒内触发首次加密搬运！"); } else throw new Error(data.message);
    } catch (e: any) { store.showAlert("错误", e.message); }
  };
  const deleteGithubTask = async (id: number) => { if (confirm("确定删除同步任务？")) { await fetch(`/api/admin/github-tasks/${id}`, { method: 'DELETE' }); fetchTasks(); } };
  
  onMounted(() => { fetchTasks(); fetchOss(); });
  </script>
  <style scoped>@import './admin-shared.css';</style>