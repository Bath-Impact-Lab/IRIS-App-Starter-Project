<template>
  <div class="feed-view-page">
    <div class="feed-grid">
      <template v-if="displayCameras.length > 0">
        <div v-for="camera in displayCameras" :key="camera.key" class="feed-card">
          <div class="feed-card-header">
            <div class="feed-card-title">{{ camera.name }}</div>
            <div class="feed-card-actions">
              <span class="activity-blinker" :class="{ active: camera.isActive }"></span>
            </div>
          </div>

          <div class="video-area" :class="{ 'video-area-empty': !camera.isActive }">
            <video
              :ref="(element) => setVideoElement(camera.streamSlot, element as HTMLVideoElement | null)"
              class="live-stream-video"
              :class="{ 'live-stream-video-hidden': !camera.isActive }"
              autoplay
              muted
              playsinline
            ></video>

            <div v-if="!camera.isActive" class="empty-video-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-video-icon">
                <rect x="2" y="4" width="15" height="16" rx="2"></rect>
                <path d="M17 10l5-3v10l-5-3z"></path>
              </svg>
              <span>{{ camera.statusText }}</span>
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

interface FeedCamera {
  id: number | string;
  name: string;
}

interface Props {
  cameras?: FeedCamera[];
  wsUrl?: string | null;
}

interface StreamState {
  active: boolean;
  connected: boolean;
  error: string | null;
  statusText: string;
}

interface StreamController {
  slot: number;
  routeIds: number[];
  routeIndex: number;
  socket: WebSocket | null;
  mediaSource: MediaSource | null;
  sourceBuffer: SourceBuffer | null;
  queue: Uint8Array[];
  queuedBytes: number;
  objectUrl: string | null;
  videoElement: HTMLVideoElement | null;
  receivedData: boolean;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  updateEndHandler: (() => void) | null;
  destroyed: boolean;
}

const STREAM_MIME_CANDIDATES = [
  'video/mp2t; codecs="avc1.64001F"',
  'video/mp2t; codecs="avc1.4D401F"',
  'video/mp2t; codecs="avc1.42E01E"',
  'video/mp2t; codecs="avc1"',
  'video/mp2t',
];
const FIRST_PACKET_TIMEOUT_MS = 2500;
const MAX_QUEUED_BYTES = 8 * 1024 * 1024;

const props = withDefaults(defineProps<Props>(), {
  cameras: () => [],
  wsUrl: null,
});

const streamStates = ref<Record<string, StreamState>>({});
const controllers = new Map<number, StreamController>();
const videoElements = new Map<number, HTMLVideoElement>();
const supportedMimeType = resolveSupportedMimeType();

const displayCameras = computed(() => {
  return props.cameras.map((camera, index) => {
    const state = streamStates.value[String(index)] ?? defaultStreamState(getIdleStatus());

    return {
      id: String(camera.id),
      key: `${camera.id}-${index}`,
      name: camera.name || `Camera ${camera.id}`,
      streamSlot: index,
      isActive: state.active,
      statusText: state.statusText,
    };
  });
});

const skeletonCount = computed(() => {
  return props.cameras.length > 0 ? props.cameras.length : 4;
});

watch(
  () => ({
    wsUrl: props.wsUrl,
    cameras: props.cameras.map((camera) => `${camera.id}:${camera.name}`).join('|'),
  }),
  ({ wsUrl }) => {
    disconnectAllStreams();
    resetStreamStates();

    if (typeof wsUrl !== 'string' || wsUrl.length === 0) {
      return;
    }

    if (!supportedMimeType) {
      return;
    }

    props.cameras.forEach((camera, index) => {
      const controller = createStreamController(index, camera);
      controllers.set(index, controller);
      openStreamRoute(controller, wsUrl);
    });
  },
  { immediate: true },
);

function resolveSupportedMimeType() {
  if (typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') {
    return null;
  }

  return STREAM_MIME_CANDIDATES.find((candidate) => MediaSource.isTypeSupported(candidate)) ?? null;
}

function defaultStreamState(statusText: string): StreamState {
  return {
    active: false,
    connected: false,
    error: null,
    statusText,
  };
}

function getIdleStatus() {
  if (!supportedMimeType) {
    return 'MPEG-TS playback is not supported in this renderer.';
  }

  if (typeof props.wsUrl !== 'string' || props.wsUrl.length === 0) {
    return 'Start IRIS to view camera feed';
  }

  return 'Waiting for feed';
}

function resetStreamStates() {
  streamStates.value = Object.fromEntries(
    props.cameras.map((_camera, index) => [String(index), defaultStreamState(getIdleStatus())]),
  );
}

function updateStreamState(slot: number, patch: Partial<StreamState>) {
  const key = String(slot);
  const current = streamStates.value[key] ?? defaultStreamState(getIdleStatus());
  streamStates.value = {
    ...streamStates.value,
    [key]: {
      ...current,
      ...patch,
    },
  };
}

function toNumericId(value: number | string) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function buildRouteIds(camera: FeedCamera, slot: number) {
  const routeIds = [slot];
  const cameraId = toNumericId(camera.id);

  if (cameraId !== null && !routeIds.includes(cameraId)) {
    routeIds.push(cameraId);
  }

  return routeIds;
}

function buildCameraStreamUrl(baseUrl: string, routeId: number) {
  const url = new URL(baseUrl);
  url.pathname = `/camera/${routeId}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function createStreamController(slot: number, camera: FeedCamera): StreamController {
  const controller: StreamController = {
    slot,
    routeIds: buildRouteIds(camera, slot),
    routeIndex: 0,
    socket: null,
    mediaSource: null,
    sourceBuffer: null,
    queue: [],
    queuedBytes: 0,
    objectUrl: null,
    videoElement: videoElements.get(slot) ?? null,
    receivedData: false,
    fallbackTimer: null,
    updateEndHandler: null,
    destroyed: false,
  };

  attachMediaSource(controller);
  return controller;
}

function attachMediaSource(controller: StreamController) {
  if (!supportedMimeType) {
    updateStreamState(controller.slot, {
      error: 'MPEG-TS playback is not supported in this renderer.',
      statusText: 'MPEG-TS playback is not supported in this renderer.',
    });
    return;
  }

  const mediaSource = new MediaSource();
  controller.mediaSource = mediaSource;
  controller.objectUrl = URL.createObjectURL(mediaSource);

  mediaSource.addEventListener(
    'sourceopen',
    () => {
      if (controller.destroyed || !controller.mediaSource || controller.mediaSource.readyState !== 'open' || controller.sourceBuffer) {
        return;
      }

      try {
        const sourceBuffer = controller.mediaSource.addSourceBuffer(supportedMimeType);
        sourceBuffer.mode = 'segments';
        controller.sourceBuffer = sourceBuffer;
        controller.updateEndHandler = () => {
          appendNextChunk(controller);
        };
        sourceBuffer.addEventListener('updateend', controller.updateEndHandler);
        sourceBuffer.addEventListener('error', () => {
          if (controller.destroyed) {
            return;
          }
          updateStreamState(controller.slot, {
            connected: false,
            error: 'Video decoder error',
            statusText: 'Video decoder error',
          });
        });
        appendNextChunk(controller);
      } catch (err) {
        updateStreamState(controller.slot, {
          connected: false,
          error: 'Unable to initialize MPEG-TS playback',
          statusText: 'Unable to initialize MPEG-TS playback',
        });
        console.warn('[FeedViewPage] Failed to initialize MediaSource.', err);
      }
    },
    { once: true },
  );

  if (controller.videoElement) {
    controller.videoElement.src = controller.objectUrl;
    void controller.videoElement.play().catch(() => {
      // Autoplay will be retried when data arrives.
    });
  }
}

function setVideoElement(slot: number, element: HTMLVideoElement | null) {
  if (element) {
    videoElements.set(slot, element);
  } else {
    videoElements.delete(slot);
  }

  const controller = controllers.get(slot);
  if (!controller) {
    return;
  }

  controller.videoElement = element;

  if (element && controller.objectUrl) {
    if (element.src !== controller.objectUrl) {
      element.src = controller.objectUrl;
    }
    void element.play().catch(() => {
      // Autoplay will be retried when data arrives.
    });
  }
}

function clearFallbackTimer(controller: StreamController) {
  if (!controller.fallbackTimer) {
    return;
  }

  clearTimeout(controller.fallbackTimer);
  controller.fallbackTimer = null;
}

function scheduleFallback(controller: StreamController) {
  clearFallbackTimer(controller);

  if (controller.destroyed || controller.routeIndex >= controller.routeIds.length - 1) {
    return;
  }

  controller.fallbackTimer = setTimeout(() => {
    if (controller.destroyed || controller.receivedData || controller.routeIndex >= controller.routeIds.length - 1) {
      return;
    }

    controller.routeIndex += 1;
    updateStreamState(controller.slot, {
      connected: false,
      statusText: `Retrying /camera/${controller.routeIds[controller.routeIndex]}`,
    });

    if (controller.socket) {
      controller.socket.close();
    }
  }, FIRST_PACKET_TIMEOUT_MS);
}

function trimQueuedChunks(controller: StreamController) {
  while (controller.queuedBytes > MAX_QUEUED_BYTES && controller.queue.length > 1) {
    const dropped = controller.queue.shift();
    if (!dropped) {
      break;
    }
    controller.queuedBytes -= dropped.byteLength;
  }
}

function appendNextChunk(controller: StreamController) {
  if (!controller.sourceBuffer || controller.sourceBuffer.updating || controller.queue.length === 0) {
    return;
  }

  const nextChunk = controller.queue.shift();
  if (!nextChunk) {
    return;
  }

  controller.queuedBytes -= nextChunk.byteLength;

  try {
    controller.sourceBuffer.appendBuffer(nextChunk);
    if (controller.videoElement) {
      void controller.videoElement.play().catch(() => {
        // Playback will resume on the next successful append.
      });
    }
  } catch (err) {
    updateStreamState(controller.slot, {
      connected: false,
      error: 'Failed to append video data',
      statusText: 'Failed to append video data',
    });
    console.warn('[FeedViewPage] Failed to append MPEG-TS chunk.', err);
  }
}

async function toUint8Array(data: Blob | ArrayBuffer | ArrayBufferView | string) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return null;
}

function openStreamRoute(controller: StreamController, baseUrl: string) {
  if (controller.destroyed) {
    return;
  }

  const routeId = controller.routeIds[controller.routeIndex];
  const streamUrl = buildCameraStreamUrl(baseUrl, routeId);
  const socket = new WebSocket(streamUrl);

  controller.socket = socket;
  socket.binaryType = 'arraybuffer';

  updateStreamState(controller.slot, {
    active: controller.receivedData,
    connected: false,
    error: null,
    statusText: `Connecting to /camera/${routeId}`,
  });

  socket.onopen = () => {
    if (controller.destroyed || controller.socket !== socket) {
      return;
    }

    updateStreamState(controller.slot, {
      connected: true,
      statusText: `Waiting on /camera/${routeId}`,
    });
    scheduleFallback(controller);
  };

  socket.onmessage = async (event) => {
    if (controller.destroyed || controller.socket !== socket) {
      return;
    }

    const chunk = await toUint8Array(event.data);
    if (!chunk || chunk.byteLength === 0) {
      return;
    }

    controller.receivedData = true;
    clearFallbackTimer(controller);
    controller.queue.push(chunk);
    controller.queuedBytes += chunk.byteLength;
    trimQueuedChunks(controller);
    appendNextChunk(controller);

    updateStreamState(controller.slot, {
      active: true,
      connected: true,
      error: null,
      statusText: `Receiving stream from /camera/${routeId}`,
    });
  };

  socket.onerror = () => {
    if (controller.destroyed || controller.socket !== socket) {
      return;
    }

    updateStreamState(controller.slot, {
      connected: false,
      error: controller.receivedData ? null : 'Video websocket error',
      statusText: controller.receivedData ? 'Stream interrupted' : 'Video websocket error',
    });
  };

  socket.onclose = () => {
    if (controller.destroyed) {
      return;
    }

    if (controller.socket === socket) {
      controller.socket = null;
    }

    clearFallbackTimer(controller);

    if (!controller.receivedData && controller.routeIds[controller.routeIndex] !== routeId) {
      openStreamRoute(controller, baseUrl);
      return;
    }

    if (!controller.receivedData && controller.routeIndex < controller.routeIds.length - 1) {
      controller.routeIndex += 1;
      openStreamRoute(controller, baseUrl);
      return;
    }

    if (!controller.receivedData) {
      updateStreamState(controller.slot, {
        connected: false,
        error: 'No video received',
        statusText: 'No video received',
      });
      return;
    }

    updateStreamState(controller.slot, {
      active: true,
      connected: false,
      statusText: 'Stream disconnected',
    });
  };
}

function teardownController(controller: StreamController) {
  controller.destroyed = true;
  clearFallbackTimer(controller);

  if (controller.socket) {
    controller.socket.close();
    controller.socket = null;
  }

  if (controller.sourceBuffer && controller.updateEndHandler) {
    controller.sourceBuffer.removeEventListener('updateend', controller.updateEndHandler);
  }

  if (controller.videoElement) {
    controller.videoElement.pause();
    controller.videoElement.removeAttribute('src');
    controller.videoElement.load();
  }

  if (controller.objectUrl) {
    URL.revokeObjectURL(controller.objectUrl);
    controller.objectUrl = null;
  }
}

function disconnectAllStreams() {
  for (const controller of controllers.values()) {
    teardownController(controller);
  }

  controllers.clear();
}

onBeforeUnmount(() => {
  disconnectAllStreams();
});
</script>

<style scoped>
.feed-view-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  transition: background 0.3s ease;
}

.feed-grid {
  flex: 1;
  padding: 92px 24px 24px;
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

.live-stream-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}

.live-stream-video-hidden {
  opacity: 0;
}

.empty-video-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  padding: 20px;
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
  .feed-grid {
    grid-template-columns: 1fr;
    padding: 84px 16px 16px;
  }
}
</style>
