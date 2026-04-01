<template>
  <div class="feed-view-page">
    <div class="feed-toolbar-wrapper">
      <Toolbar
        :resolution="selectedResolution"
        :fps="selectedFps"
        @update:resolution="emit('update:resolution', $event)"
        @update:fps="emit('update:fps', $event)"
      />
    </div>

    <div class="feed-grid">
      <template v-if="displayCameras.length > 0">
        <div v-for="camera in displayCameras" :key="camera.id" class="feed-card">
          <div class="feed-card-header">
            <div class="feed-card-title">{{ camera.name }}</div>
            <div class="feed-card-actions">
              <span class="activity-blinker" :class="{ active: Boolean(camera.frameSrc) }"></span>
            </div>
          </div>

          <div class="video-area" :class="{ 'video-area-empty': !camera.frameSrc }">
            <img
              v-if="camera.frameSrc"
              :src="camera.frameSrc"
              class="live-stream-img"
              :alt="camera.name"
            />

            <div v-else class="empty-video-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-video-icon">
                <rect x="2" y="4" width="15" height="16" rx="2"></rect>
                <path d="M17 10l5-3v10l-5-3z"></path>
              </svg>
              <span>Waiting for feed</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-for="n in skeletonCount" :key="n" class="feed-card">
          <div class="feed-card-header">
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
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Toolbar from './app/Toolbar.vue';

interface FeedCamera {
  id: number | string;
  name: string;
}

interface Props {
  cameras?: FeedCamera[];
  wsUrl?: string | null;
  resolution?: string;
  fps?: number;
}

const props = withDefaults(defineProps<Props>(), {
  cameras: () => [],
  wsUrl: null,
  resolution: '1920x1080',
  fps: 30,
});

const emit = defineEmits<{
  'update:resolution': [value: string];
  'update:fps': [value: number];
}>();

const selectedResolution = ref(props.resolution);
const selectedFps = ref(props.fps);
const cameraFrames = ref<Record<string, string>>({});

let ws: WebSocket | null = null;

watch(() => props.resolution, (value) => {
  selectedResolution.value = value;
});

watch(() => props.fps, (value) => {
  selectedFps.value = value;
});

const displayCameras = computed(() => {
  if (props.cameras.length > 0) {
    return props.cameras.map((camera) => {
      const id = String(camera.id);
      return {
        id,
        name: camera.name || `Camera ${id}`,
        frameSrc: cameraFrames.value[id] ?? null,
      };
    });
  }

  const activeIds = Object.keys(cameraFrames.value).sort((left, right) => Number(left) - Number(right));
  return activeIds.map((id) => ({
    id,
    name: `Camera ${id}`,
    frameSrc: cameraFrames.value[id],
  }));
});

const skeletonCount = computed(() => {
  return props.cameras.length > 0 ? props.cameras.length : 4;
});

watch(() => props.wsUrl, (nextUrl) => {
  disconnectStream();
  clearFrames();

  if (typeof nextUrl === 'string' && nextUrl.length > 0) {
    connectStream(nextUrl);
  }
}, { immediate: true });

function connectStream(url: string) {
  ws = new WebSocket(url);

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') {
      return;
    }

    try {
      const payload = JSON.parse(event.data) as {
        cameraId?: number | string;
        image?: string;
        mimeType?: string;
      };

      if (typeof payload.image !== 'string' || payload.image.length === 0) {
        return;
      }

      const cameraId = String(payload.cameraId ?? '0');
      const mimeType = typeof payload.mimeType === 'string' && payload.mimeType.length > 0
        ? payload.mimeType
        : 'image/jpeg';

      cameraFrames.value = {
        ...cameraFrames.value,
        [cameraId]: `data:${mimeType};base64,${payload.image}`,
      };
    } catch (err) {
      console.warn('[FeedViewPage] Failed to parse frame payload.', err);
    }
  };

  ws.onerror = (err) => {
    console.warn('[FeedViewPage] Video websocket error.', err);
  };

  ws.onclose = () => {
    if (ws?.url === url) {
      ws = null;
    }
  };
}

function disconnectStream() {
  if (!ws) return;
  ws.close();
  ws = null;
}

function clearFrames() {
  cameraFrames.value = {};
}

onBeforeUnmount(() => {
  disconnectStream();
  clearFrames();
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

.feed-card-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.2);
}

[data-theme="light"] .feed-card-header {
  background: rgba(31, 78, 121, 0.03);
  border-bottom-color: rgba(31, 78, 121, 0.08);
}

.feed-card-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--fg);
}

.feed-card-actions {
  display: flex;
  align-items: center;
}

.video-area {
  flex: 1;
  display: flex;
  background: #000;
  overflow: hidden;
  position: relative;
  align-items: center;
  justify-content: center;
}

.video-area-empty {
  background: rgba(0, 0, 0, 0.4);
}

[data-theme="light"] .video-area-empty {
  background: rgba(31, 78, 121, 0.05);
}

.live-stream-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.empty-video-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  font-weight: 600;
}

[data-theme="light"] .empty-video-state {
  color: rgba(31, 78, 121, 0.55);
}

.empty-video-icon {
  opacity: 0.8;
}

.activity-blinker {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  transition: background 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.activity-blinker.active {
  background: #6be675;
  box-shadow: 0 0 6px rgba(107, 230, 117, 0.8);
  animation: blink 1.2s ease-in-out infinite;
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

@keyframes blink {
  0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(107, 230, 117, 0.8); }
  50% { opacity: 0.25; box-shadow: none; }
}

@media (max-width: 768px) {
  .feed-view-page {
    inset: var(--app-topbar-height, 63px) 0 0 0;
  }

  .feed-grid {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}
</style>
