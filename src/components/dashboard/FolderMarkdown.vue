<template>
  <section class="site-desc md-elevation-1 folder-md-section">
    <div v-if="!isEditing">
      <div class="markdown-body" v-html="renderedHtml || '> 暂无目录描述'"></div>
      <md-text-button v-if="isAdmin" @click="isEditing = true" style="margin-top: 16px;">
        <md-icon slot="icon">edit_note</md-icon> 编辑目录描述
      </md-text-button>
    </div>
    <div v-else style="display:flex; flex-direction:column; gap:16px;">
      <md-outlined-text-field type="textarea" rows="6" label="目录 Markdown 描述" v-model="editContent"></md-outlined-text-field>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <md-text-button @click="isEditing = false">取消</md-text-button>
        <md-filled-button @click="save">保存描述</md-filled-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import MarkdownIt from 'markdown-it';

const props = defineProps<{ folderMd: string; isAdmin: boolean }>();
const emit = defineEmits(['save']);

const md = new MarkdownIt();
const isEditing = ref(false);
const editContent = ref(props.folderMd || '');
const renderedHtml = ref('');

const renderMd = (text: string) => { renderedHtml.value = md.render(text); };

watch(() => props.folderMd, (newVal) => { 
  editContent.value = newVal || ''; 
  renderMd(newVal || ''); 
});

onMounted(() => renderMd(props.folderMd || ''));

const save = () => {
  emit('save', editContent.value);
  isEditing.value = false;
};
</script>

<style scoped>
.folder-md-section { background: var(--md-sys-color-surface-variant); padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid var(--md-sys-color-outline); }
.markdown-body { color: var(--md-sys-color-on-surface); font-size: 1.05rem; line-height: 1.6; }
md-outlined-text-field { width: 100%; }
</style>