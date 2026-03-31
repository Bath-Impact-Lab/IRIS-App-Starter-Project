<template>
  <Transition name="fade">
    <div v-if="show" class="rename-overlay" @click.self="emit('close')">
      <div class="rename-dialog">
        <button class="rename-dialog-close" @click="emit('close')">&times;</button>
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
            @keyup.enter="submit"
            @keyup.esc="emit('close')"
          />
          <p v-if="error" class="rename-error">{{ error }}</p>
        </div>
        <div class="rename-modal-footer">
          <button class="btn rename-cancel" @click="emit('close')">Cancel</button>
          <button class="btn rename-confirm" @click="submit" :disabled="submitDisabled">Save</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

interface Props {
  show: boolean;
  recordingName: string;
  error: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  submit: [value: string];
}>();

const renameInputRef = ref<HTMLInputElement | null>(null);
const renameValue = ref('');

const submitDisabled = computed(() => {
  const trimmed = renameValue.value.trim();
  return !trimmed || trimmed === props.recordingName.trim();
});

watch(
  () => props.show,
  async (show) => {
    renameValue.value = props.recordingName;
    if (show) {
      await nextTick();
      renameInputRef.value?.select();
    }
  },
  { immediate: true },
);

watch(
  () => props.recordingName,
  (value) => {
    if (props.show) {
      renameValue.value = value;
    }
  },
);

function submit() {
  const trimmed = renameValue.value.trim();
  if (!trimmed || trimmed === props.recordingName.trim()) return;
  emit('submit', trimmed);
}
</script>
