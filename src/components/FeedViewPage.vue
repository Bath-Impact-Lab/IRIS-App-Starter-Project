<template>
  <div class="feed-view-page">
    <div class="feed-toolbar-wrapper">
      <Toolbar
        :devices="devices"
        :camera="camera"
        :resolution="selectedResolution"
        :fps="selectedFps"
        @update:camera="emit('update:camera', $event)"
        @update:resolution="updateResolution"
        @update:fps="updateFps"
      />
    </div>

    <div class="feed-grid">
      <div v-for="n in displayCount" :key="n" class="feed-card">
        <div class="skeleton-header">
          <div class="skeleton-title"></div>
          <div class="skeleton-actions"></div>
        </div>
        <div class="skeleton-video-area">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="skeleton-icon">
            <rect x="2" y="2" width="20" height="20" rx="2.5" ry="2.5"></rect>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="12" y1="2" x2="12" y2="22"></line>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Toolbar from './app/Toolbar.vue';

interface Props {
  devices?: MediaDeviceInfo[];
  selectedCameras?: MediaDeviceInfo[];
  camera?: string;
  resolution?: string;
  fps?: number;
}

const props = withDefaults(defineProps<Props>(), {
  devices: () => [],
  selectedCameras: () => [],
  camera: '',
  resolution: '1920x1080',
  fps: 30,
});

const emit = defineEmits<{
  'update:camera': [value: string];
  'update:resolution': [value: string];
  'update:fps': [value: number];
}>();

const selectedResolution = ref(props.resolution);
const selectedFps = ref(props.fps);

watch(() => props.resolution, (value) => {
  selectedResolution.value = value;
});

watch(() => props.fps, (value) => {
  selectedFps.value = value;
});

function updateResolution(value: string) {
  selectedResolution.value = value;
  emit('update:resolution', value);
}

function updateFps(value: number) {
  selectedFps.value = value;
  emit('update:fps', value);
}

// Default to 4 skeleton placeholders if no physical cameras are passed in yet
const displayCount = computed(() => {
  return props.selectedCameras.length > 0 ? props.selectedCameras.length : 4;
});
</script>

<style scoped>
.feed-view-page {
  position: absolute;
  inset: var(--app-topbar-height, 63px) 0 0 var(--app-session-sidenav-width, 240px);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  transition: background 0.3s ease;
}

.sidebar-open .feed-view-page {
  right: var(--app-sidebar-width, 250px);
}

.feed-toolbar-wrapper {
  padding: 16px;
  display: flex;
  justify-content: center;
  background: rgba(12, 18, 25, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  z-index: 10;
}

[data-theme="light"] .feed-toolbar-wrapper {
  background: rgba(255, 255, 255, 0.65);
  border-bottom-color: rgba(31, 78, 121, 0.1);
}

.feed-grid {
  flex: 1;
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  overflow-y: auto;
  align-content: start;
}

/* ── Skeleton Component Styles ── */
.feed-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  aspect-ratio: 16 / 9;
}

[data-theme="light"] .feed-card {
  background: #ffffff;
  border-color: rgba(31, 78, 121, 0.15);
  box-shadow: 0 4px 12px rgba(31, 78, 121, 0.05);
}

.skeleton-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.2);
}

[data-theme="light"] .skeleton-header {
  background: rgba(31, 78, 121, 0.03);
  border-bottom-color: rgba(31, 78, 121, 0.08);
}

.skeleton-title {
  width: 40%;
  height: 14px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-actions {
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  animation: pulse 1.5s infinite ease-in-out;
}

[data-theme="light"] .skeleton-title,
[data-theme="light"] .skeleton-actions {
  background: rgba(31, 78, 121, 0.15);
}

.skeleton-video-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  animation: pulse 1.5s infinite ease-in-out;
}

[data-theme="light"] .skeleton-video-area {
  background: rgba(31, 78, 121, 0.05);
}

.skeleton-icon {
  color: rgba(255, 255, 255, 0.1);
}

[data-theme="light"] .skeleton-icon {
  color: rgba(31, 78, 121, 0.15);
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}

/* ── Mobile Responsiveness ── */
@media (max-width: 768px) {
  .feed-view-page {
    inset: var(--app-topbar-height, 63px) 0 0 0;
  }
  .sidebar-open .feed-view-page {
    right: 0;
  }
  .feed-grid {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}
</style>
