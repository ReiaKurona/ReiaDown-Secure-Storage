<template>
    <div class="panel">
      <div class="panel-header"><h2>用户列表</h2><span class="badge">跨库只读</span></div>
      <div class="table-container md-elevation-1"><table class="md3-table"><thead><tr><th>用户邮箱</th><th>身份权限</th></tr></thead><tbody><tr v-for="user in usersList" :key="user.email"><td>{{ user.email }}</td><td><span :class="['role-chip', user.is_admin ? 'admin' : 'user']">{{ user.is_admin ? '超级管理员' : '普通用户' }}</span></td></tr></tbody></table></div>
    </div>
  </template>
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  const usersList = ref<any[]>([]); const fetchUsers = async () => { const res = await fetch('/api/admin/users'); const data = await res.json(); if (data.success) usersList.value = data.users; };
  onMounted(fetchUsers);
  </script>
  <style scoped>@import './admin-shared.css';</style>