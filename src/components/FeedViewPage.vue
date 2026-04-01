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
            <canvas :ref="(element) => setCanvasElement(camera.streamSlot, element as HTMLCanvasElement | null)"
              class="live-stream-canvas" :class="{ 'live-stream-canvas-hidden': !camera.isActive }"></canvas>

            <div v-if="!camera.isActive" class="empty-video-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round" class="empty-video-icon">
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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round" class="skeleton-icon">
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
  canvasElement: HTMLCanvasElement | null;
  canvasContext: CanvasRenderingContext2D | null;
  decoder: VideoDecoder | null;
  decoderCodec: string | null;
  naluBuffer: Uint8Array;
  pendingChunks: Uint8Array[];
  pendingFrame: VideoFrame | null;
  renderRequestId: number | null;
  decodeStartTimes: Map<number, number>;
  droppingFrames: boolean;
  receivedBytes: boolean;
  hasDecodedFrame: boolean;
  hasReceivedKeyframe: boolean;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  destroyed: boolean;
}

const DEFAULT_CODEC_STRING = 'avc1.64001F'; // High Profile
const FALLBACK_CODEC_CANDIDATES = [
  DEFAULT_CODEC_STRING,
  'avc1.4D401F', // Main Profile
  'avc1.42E01F', // Baseline Profile
  'avc1.42E01E',
];
const FIRST_PACKET_TIMEOUT_MS = 2500;
const webCodecsSupported = typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';

const props = withDefaults(defineProps<Props>(), {
  cameras: () => [],
  wsUrl: null,
});

const streamStates = ref<Record<string, StreamState>>({});
const controllers = new Map<number, StreamController>();
const canvasElements = new Map<number, HTMLCanvasElement>();
const streamConfigKey = computed(() => {
  const wsPart = typeof props.wsUrl === 'string' ? props.wsUrl : '';
  const cameraPart = props.cameras.map((camera) => `${camera.id}:${camera.name}`).join('|');
  return `${wsPart}::${cameraPart}`;
});

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
  streamConfigKey,
  () => {
    const wsUrl = typeof props.wsUrl === 'string' ? props.wsUrl : '';

    disconnectAllStreams();
    resetStreamStates();

    if (wsUrl.length === 0 || !webCodecsSupported) {
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

function defaultStreamState(statusText: string): StreamState {
  return {
    active: false,
    connected: false,
    error: null,
    statusText,
  };
}

function getIdleStatus() {
  if (!webCodecsSupported) {
    return 'WebCodecs H.264 playback is not supported in this browser.';
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
  const canvasElement = canvasElements.get(slot) ?? null;
  return {
    slot,
    routeIds: buildRouteIds(camera, slot),
    routeIndex: 0,
    socket: null,
    canvasElement,
    canvasContext: getCanvasContext(canvasElement),
    decoder: null,
    decoderCodec: null,
    naluBuffer: new Uint8Array(0),
    pendingChunks: [],
    pendingFrame: null,
    renderRequestId: null,
    decodeStartTimes: new Map(),
    droppingFrames: false,
    receivedBytes: false,
    hasDecodedFrame: false,
    hasReceivedKeyframe: false,
    fallbackTimer: null,
    destroyed: false,
  };
}

function getCanvasContext(element: HTMLCanvasElement | null) {
  if (!element) return null;
  const context = element.getContext('2d', {
    alpha: false,
    desynchronized: true,
  });

  if (context) {
    context.imageSmoothingEnabled = false;
  }

  return context;
}

function setCanvasElement(slot: number, element: HTMLCanvasElement | null) {
  if (element) {
    canvasElements.set(slot, element);
  } else {
    canvasElements.delete(slot);
  }

  const controller = controllers.get(slot);
  if (!controller) return;

  controller.canvasElement = element;
  controller.canvasContext = getCanvasContext(element);

  if (controller.pendingFrame && controller.canvasContext) {
    scheduleFrameRender(controller);
  }
}

function clearFallbackTimer(controller: StreamController) {
  if (controller.fallbackTimer) {
    clearTimeout(controller.fallbackTimer);
    controller.fallbackTimer = null;
  }
}

function scheduleFallback(controller: StreamController) {
  clearFallbackTimer(controller);

  if (controller.destroyed || controller.routeIndex >= controller.routeIds.length - 1) {
    return;
  }

  controller.fallbackTimer = setTimeout(() => {
    if (controller.destroyed || controller.receivedBytes || controller.routeIndex >= controller.routeIds.length - 1) {
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

function closeDecoder(controller: StreamController) {
  if (!controller.decoder) return;
  try {
    controller.decoder.close();
  } catch { }
  controller.decoder = null;
  controller.decoderCodec = null;
}

function disposePendingFrame(controller: StreamController) {
  const { pendingFrame } = controller;
  if (!pendingFrame) {
    return;
  }

  controller.decodeStartTimes.delete(pendingFrame.timestamp);

  try {
    pendingFrame.close();
  } catch {
    // Ignore teardown errors from already-closed frames.
  }

  controller.pendingFrame = null;
}

function cancelScheduledRender(controller: StreamController) {
  if (controller.renderRequestId === null) {
    return;
  }

  cancelAnimationFrame(controller.renderRequestId);
  controller.renderRequestId = null;
}

function scheduleFrameRender(controller: StreamController) {
  if (controller.destroyed || controller.renderRequestId !== null || !controller.pendingFrame) {
    return;
  }

  controller.renderRequestId = requestAnimationFrame(() => {
    controller.renderRequestId = null;
    renderPendingFrame(controller);

    if (controller.pendingFrame) {
      scheduleFrameRender(controller);
    }
  });
}

function renderPendingFrame(controller: StreamController) {
  if (controller.destroyed) {
    disposePendingFrame(controller);
    return;
  }

  const context = controller.canvasContext ?? getCanvasContext(controller.canvasElement);
  if (!context) {
    return;
  }

  controller.canvasContext = context;

  const frame = controller.pendingFrame;
  if (!frame) {
    return;
  }

  const targetWidth = frame.displayWidth || frame.codedWidth;
  const targetHeight = frame.displayHeight || frame.codedHeight;

  if (targetWidth <= 0 || targetHeight <= 0) {
    disposePendingFrame(controller);
    return;
  }

  controller.pendingFrame = null;

  try {
    if (context.canvas.width !== targetWidth || context.canvas.height !== targetHeight) {
      context.canvas.width = targetWidth;
      context.canvas.height = targetHeight;
    }

    context.drawImage(frame as unknown as CanvasImageSource, 0, 0, targetWidth, targetHeight);

    controller.hasDecodedFrame = true;
    controller.decodeStartTimes.delete(frame.timestamp);
    updateStreamState(controller.slot, {
      active: true,
      connected: true,
      error: null,
      statusText: 'Live feed',
    });
  } finally {
    try {
      frame.close();
    } catch {
      // Ignore present errors from already-closed frames.
    }
  }
}

function initWebCodecs(controller: StreamController) {
  if (controller.decoder && controller.decoder.state === 'configured') return;

  closeDecoder(controller);

  for (const candidate of FALLBACK_CODEC_CANDIDATES) {
    try {
      const decoder = new VideoDecoder({
        output(frame) {
          handleDecodedFrame(controller, frame);
        },
        error(error) {
          if (controller.destroyed) return;
          console.warn(`[Camera ${controller.slot}] Decoder error for ${candidate}:`, error);
          updateStreamState(controller.slot, {
            active: controller.hasDecodedFrame,
            connected: false,
            error: 'Video decoder error',
            statusText: 'Video decoder error',
          });
        },
      });

      VideoDecoder.isConfigSupported({
        codec: candidate,
        hardwareAcceleration: 'prefer-hardware', // Demand the GPU
      }).then((support) => {
        if (!support.supported) {
          console.warn(`[Camera ${controller.slot}] Warning: Hardware decoding not supported for ${candidate}. Falling back to software (this will lag!).`);
        } else {
          console.log(`[Camera ${controller.slot}] Hardware decoding supported for ${candidate}!`);
        }
      });

      decoder.configure({
        codec: candidate,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware', // Add this flag!
      });

      controller.decoder = decoder;
      controller.decoderCodec = candidate;
      return; // Successfully configured
    } catch (error) {
      console.warn(`[Camera ${controller.slot}] Failed to configure decoder for ${candidate}.`);
    }
  }

  updateStreamState(controller.slot, {
    active: false,
    connected: false,
    error: 'Unable to configure H.264 decoder',
    statusText: 'Unable to configure H.264 decoder',
  });
}

function handleDecodedFrame(controller: StreamController, frame: VideoFrame) {
  if (controller.destroyed) {
    try {
      frame.close();
    } catch {
      // Ignore teardown errors from already-closed frames.
    }
    return;
  }

  disposePendingFrame(controller);
  controller.pendingFrame = frame;
  scheduleFrameRender(controller);
}

function findStartCode(buf: Uint8Array, start: number) {
  for (let i = start; i < buf.length - 2; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0) {
      if (buf[i + 2] === 1) return { index: i, length: 3 };
      if (i < buf.length - 3 && buf[i + 2] === 0 && buf[i + 3] === 1) return { index: i, length: 4 };
    }
  }
  return null;
}

function processWebSocketData(controller: StreamController, newData: Uint8Array) {
  initWebCodecs(controller);

  const decoder = controller.decoder;
  if (!decoder || decoder.state !== 'configured') return;

  const buffer = new Uint8Array(controller.naluBuffer.length + newData.length);
  buffer.set(controller.naluBuffer);
  buffer.set(newData, controller.naluBuffer.length);

  let offset = 0;
  let currentStart = findStartCode(buffer, offset);

  while (currentStart !== null) {
    const nextStart = findStartCode(buffer, currentStart.index + currentStart.length);

    if (nextStart !== null) {
      // 1. EXTRACT NAL UNIT *WITH* ITS START CODE
      const nalUnitWithStartCode = buffer.subarray(currentStart.index, nextStart.index);
      const nalType = buffer[currentStart.index + currentStart.length] & 0x1F;
      console.log(`[Camera ${controller.slot}] Received NAL unit of type ${nalType} (buffered: ${decoder.decodeQueueSize})`);
      if (decoder.decodeQueueSize > 2) {
        controller.droppingFrames = true;
      }

      // 2. ACCUMULATE METADATA & IMAGE SLICES TOGETHER
      controller.pendingChunks.push(nalUnitWithStartCode);

      // Type 1 = P/B-Frame Slice, Type 5 = IDR Keyframe Slice
      // These mark the END of a complete "Access Unit" (a full frame's worth of data)
      if (nalType === 1 || nalType === 5) {
        const isKeyframe = (nalType === 5);

        if (isKeyframe) {
          controller.hasReceivedKeyframe = true;
          controller.droppingFrames = false; // Reset frame dropper when keyframe arrives
        }

        if (controller.hasReceivedKeyframe && !controller.droppingFrames) {
          // Flatten all accumulated NAL units (SPS, PPS, IDR) into one big chunk
          const totalLength = controller.pendingChunks.reduce((acc, c) => acc + c.length, 0);
          const combined = new Uint8Array(totalLength);
          let combineOffset = 0;
          for (const c of controller.pendingChunks) {
            combined.set(c, combineOffset);
            combineOffset += c.length;
          }

          const timestamp = Math.round(performance.now() * 1000);
          const chunk = new EncodedVideoChunk({
            type: isKeyframe ? 'key' : 'delta',
            timestamp: timestamp,
            data: combined
          });

          controller.decodeStartTimes.set(timestamp, performance.now());
          try {
            decoder.decode(chunk);
          } catch (e) {
            controller.decodeStartTimes.delete(timestamp);
            console.warn(`[Camera ${controller.slot}] Decode error:`, e);
          }
        }

        // Clear the accumulated data for the next frame
        controller.pendingChunks = [];
      }

      currentStart = nextStart;
    } else {
      break;
    }
  }

  if (currentStart !== null) {
    controller.naluBuffer = buffer.subarray(currentStart.index);
  } else {
    if (buffer.length > 1024 * 1024) {
      controller.naluBuffer = new Uint8Array(0);
    } else {
      controller.naluBuffer = buffer;
    }
  }
}

async function toUint8Array(data: Blob | ArrayBuffer | ArrayBufferView | string) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

function openStreamRoute(controller: StreamController, baseUrl: string) {
  if (controller.destroyed) return;

  const routeId = controller.routeIds[controller.routeIndex];
  const streamUrl = buildCameraStreamUrl(baseUrl, routeId);
  const socket = new WebSocket(streamUrl);

  controller.socket = socket;
  socket.binaryType = 'arraybuffer';

  updateStreamState(controller.slot, {
    active: controller.hasDecodedFrame,
    connected: false,
    error: null,
    statusText: `Connecting to /camera/${routeId}`,
  });

  socket.onopen = () => {
    if (controller.destroyed || controller.socket !== socket) return;

    updateStreamState(controller.slot, {
      connected: true,
      statusText: `Waiting on /camera/${routeId}`,
    });
    scheduleFallback(controller);
  };

  socket.onmessage = async (event) => {
    if (controller.destroyed || controller.socket !== socket) return;

    const chunk = await toUint8Array(event.data);
    if (!chunk || chunk.byteLength === 0) return;

    controller.receivedBytes = true;
    clearFallbackTimer(controller);

    // Feed the WebCodecs pipeline
    processWebSocketData(controller, chunk);

    updateStreamState(controller.slot, {
      active: controller.hasDecodedFrame,
      connected: true,
      error: null,
      statusText: controller.hasDecodedFrame ? `Receiving H.264 from /camera/${routeId}` : 'Buffering H.264 stream',
    });
  };

  socket.onerror = () => {
    if (controller.destroyed || controller.socket !== socket) return;

    updateStreamState(controller.slot, {
      active: controller.hasDecodedFrame,
      connected: false,
      error: controller.receivedBytes ? null : 'Video websocket error',
      statusText: controller.receivedBytes ? 'Stream interrupted' : 'Video websocket error',
    });
  };

  socket.onclose = () => {
    if (controller.destroyed) return;

    if (controller.socket === socket) {
      controller.socket = null;
    }

    clearFallbackTimer(controller);

    if (!controller.receivedBytes && controller.routeIds[controller.routeIndex] !== routeId) {
      openStreamRoute(controller, baseUrl);
      return;
    }

    if (!controller.receivedBytes && controller.routeIndex < controller.routeIds.length - 1) {
      controller.routeIndex += 1;
      openStreamRoute(controller, baseUrl);
      return;
    }

    if (!controller.receivedBytes) {
      updateStreamState(controller.slot, {
        connected: false,
        error: 'No video received',
        statusText: 'No video received',
      });
      return;
    }

    updateStreamState(controller.slot, {
      active: controller.hasDecodedFrame,
      connected: false,
      statusText: 'Stream disconnected',
    });
  };
}

function teardownController(controller: StreamController) {
  controller.destroyed = true;
  clearFallbackTimer(controller);
  cancelScheduledRender(controller);

  if (controller.socket) {
    controller.socket.close();
    controller.socket = null;
  }

  closeDecoder(controller);
  disposePendingFrame(controller);

  if (controller.canvasContext && controller.canvasElement) {
    controller.canvasContext.clearRect(0, 0, controller.canvasElement.width, controller.canvasElement.height);
  }

  controller.canvasContext = null;
  controller.canvasElement = null;
  controller.naluBuffer = new Uint8Array(0);
  controller.pendingChunks = [];
  controller.decodeStartTimes.clear();
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

.live-stream-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
  object-fit: contain;
}

.live-stream-canvas-hidden {
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
  0% {
    opacity: 0.6;
  }

  50% {
    opacity: 0.3;
  }

  100% {
    opacity: 0.6;
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 6px rgba(107, 230, 117, 0.8);
  }

  50% {
    opacity: 0.25;
    box-shadow: none;
  }
}

@media (max-width: 768px) {
  .feed-grid {
    grid-template-columns: 1fr;
    padding: 84px 16px 16px;
  }
}
</style>
