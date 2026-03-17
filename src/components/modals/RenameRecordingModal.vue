<template>
  <Transition name="fade">
    <div v-if="showRenameModal" class="rename-overlay" @click.self="closeRenameModal">
      <div class="rename-dialog">
        <button class="rename-dialog-close" @click="closeRenameModal">×</button>
        <div class="rename-dialog-header">
          <h2 class="rename-dialog-title">Rename Recording</h2>
          <p class="rename-dialog-subtitle">Update the folder name for this recording</p>
        </div>
        <div class="rename-modal-body">
          <label class="rename-label">Folder name</label>
          <input
            ref="renameInputRef"
            v-model="renameValue"
            class="rename-input"
            type="text"
            placeholder="Recording name"
            @keyup.enter="submitRename"
            @keyup.esc="closeRenameModal"
          />
          <p v-if="renameError" class="rename-error">{{ renameError }}</p>
        </div>
        <div class="rename-modal-footer">
          <button class="btn rename-cancel" @click="closeRenameModal">Cancel</button>
          <button class="btn rename-confirm" @click="submitRename" :disabled="!renameValue.trim() || renameValue === fsSelectedRecording?.name">Save</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useFilesystemStore } from '../../stores/useFilesystemStore';
import { useUIStore } from '../../stores/useUIStore';

const { fsSelectedRecording, renameError, renameValue, closeRenameModal, submitRename } = useFilesystemStore();
const { showRenameModal } = useUIStore();

const renameInputRef = ref<HTMLInputElement | null>(null);

watch(showRenameModal, (value) => {
  if (value) {
    void nextTick(() => renameInputRef.value?.select());
  }
});
</script>
