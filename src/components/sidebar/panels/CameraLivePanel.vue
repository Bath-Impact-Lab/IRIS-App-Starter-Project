<template>
  <div class="panel-root">
    <div class="cameras">
      <div v-if="running" class="stream-preview">
        <div class="camera-text stream-preview-title">IRIS Live Stream</div>
        <div class="camera-grid" :class="`grid-cols-${Math.min(liveCameraCount, 2)}`">
          <div
            v-for="camIdx in liveCameraCount"
            :key="camIdx - 1"
            class="camera-video-wrapper"
          >
            <div class="camera-video-label">Camera {{ camIdx - 1 }}</div>
            <video
              :ref="(el) => setVideoRef(camIdx - 1, el as HTMLVideoElement | null)"
              class="camera-video"
              autoplay
              playsinline
              muted
            />
          </div>
        </div>
        <div v-if="liveStreamStatus" class="stream-status">
          {{ liveStreamStatus }}
        </div>
      </div>

      <template v-else>
        <div
          v-for="(camera, index) in selectedCameras ?? []"
          :key="camera.deviceId"
          style="width: 100%;"
          draggable="true"
          :class="['drag-item', { 'drag-over': dragOverIndex === index, dragging: dragSourceIndex === index }]"
          @dragstart="onDragStart(index)"
          @dragenter.prevent="onDragEnter(index)"
          @dragover.prevent
          @dragleave="onDragLeave(index)"
          @drop.prevent="onDrop(index)"
          @dragend="onDragEnd"
        >
          <div
            class="camera-list"
            :style="{
              width: '100%',
              boxShadow: deviceColour[camera.deviceId] ? `inset 4px 0 0 ${deviceColour[camera.deviceId]}` : 'none',
              paddingLeft: deviceColour[camera.deviceId] ? '8px' : '0',
            }"
          >
            <div class="camera-text">
              <span class="drag-handle" title="Drag to reorder">⠿</span>
              {{ camera.label ? camera.label.split(' ')[0] + ' ' : '' }}{{ deviceShortCode(camera.deviceId) }}
              <button class="button btn" style="padding: 3px 5px;" @click="rotateCamera(camera, index)" :disabled="running">
                <img style="width: 30px;" src="/assets/anticlockwise-2-line.svg" alt="" />
              </button>
            </div>

            <div :id="`camera-box${index}`">
              <video
                style="width: 100%;"
                :id="`cameraFeed${index}`"
                autoplay
                playsinline
                muted
              />
            </div>

            <div>
              <button
                class="button btn calibrate-intrinsics-btn"
                style="margin-top: 5px;"
                @click="onCalibrateIntrinsics(camera)"
                :disabled="running || calibratingIntrinsics.has(camera.deviceId)"
                title="Hold ArUco marker in front of this camera, then click"
              >
                <span v-if="calibratingIntrinsics.has(camera.deviceId)" class="calib-spinner"></span>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0; align-self:center; display:block;">
                  <rect x="2" y="2" width="20" height="20" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
                  <rect x="4" y="4" width="6" height="6" fill="currentColor" rx="0.5"/>
                  <rect x="5" y="5" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
                  <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
                  <rect x="14" y="4" width="6" height="6" fill="currentColor" rx="0.5"/>
                  <rect x="15" y="5" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
                  <rect x="16" y="6" width="2" height="2" fill="currentColor"/>
                  <rect x="4" y="14" width="6" height="6" fill="currentColor" rx="0.5"/>
                  <rect x="5" y="15" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
                  <rect x="6" y="16" width="2" height="2" fill="currentColor"/>
                  <rect x="11" y="4" width="2" height="2" fill="currentColor"/>
                  <rect x="14" y="11" width="2" height="2" fill="currentColor"/>
                  <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
                  <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                  <rect x="14" y="17" width="2" height="2" fill="currentColor"/>
                  <rect x="17" y="11" width="2" height="2" fill="currentColor"/>
                  <rect x="17" y="14" width="2" height="2" fill="currentColor"/>
                </svg>
                {{ calibratingIntrinsics.has(camera.deviceId) ? 'Calibrating…' : 'Calibrate Intrinsics' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="iris-controls">
      <button
        class="button btn calibrate-extrinsics-btn"
        @click="onCalibrateExtrinsics"
        :disabled="running || calibratingExtrinsics || (selectedCameras?.length ?? 0) < 2"
        :title="(selectedCameras?.length ?? 0) < 2 ? 'Select at least 2 cameras' : 'Hold ArUco marker in front of ALL cameras, then click'"
      >
        <span v-if="calibratingExtrinsics" class="calib-spinner"></span>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0; align-self:center; display:block;">
          <rect x="2" y="2" width="20" height="20" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <rect x="4" y="4" width="6" height="6" fill="currentColor" rx="0.5"/>
          <rect x="5" y="5" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
          <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
          <rect x="14" y="4" width="6" height="6" fill="currentColor" rx="0.5"/>
          <rect x="15" y="5" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
          <rect x="16" y="6" width="2" height="2" fill="currentColor"/>
          <rect x="4" y="14" width="6" height="6" fill="currentColor" rx="0.5"/>
          <rect x="5" y="15" width="4" height="4" fill="var(--sidebar, #111)" rx="0.3"/>
          <rect x="6" y="16" width="2" height="2" fill="currentColor"/>
          <rect x="11" y="4" width="2" height="2" fill="currentColor"/>
          <rect x="14" y="11" width="2" height="2" fill="currentColor"/>
          <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
          <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
          <rect x="14" y="17" width="2" height="2" fill="currentColor"/>
          <rect x="17" y="11" width="2" height="2" fill="currentColor"/>
          <rect x="17" y="14" width="2" height="2" fill="currentColor"/>
        </svg>
        {{ calibratingExtrinsics ? 'Calibrating…' : 'Calibrate Extrinsics' }}
      </button>
      <div v-if="!running && !allCamerasReady && (selectedCameras?.length ?? 0) > 0" class="warming-up">
        <span class="calib-spinner warming-spinner"></span>
        Warming up cameras…
      </div>
      <div class="parent">
        <button class="button btn grid1" @click="onStartIris" :disabled="running || !allCamerasReady">Start IRIS</button>
        <select
          v-model.number="irisFps"
          name="FPS"
          id="fps"
          class="button grid2"
          style="font-size: 13px; height: 33px; margin: 5px 0;"
        >
          <option>15</option>
          <option>30</option>
          <option>60</option>
          <option>100</option>
        </select>

        <button class="button btn grid3" @click="onStopIris" :disabled="!IrisState.running">Stop IRIS</button>
      </div>
    </div>
  </div>
 
</template>

<script setup lang="ts">
import mpegts from 'mpegts.js';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { deviceShortCode, applyCameraRotation } from '../useCameraFeedUtils';
import { useCameraStore } from '../../../stores/useCameraStore';
import { useIrisStore } from '../../../stores/useIrisStore';
import { useSceneCameras } from '../../../lib/useSceneCameras';

const {
  cameraRotation,
  devices,
  selectedDeviceIds,
  selectedDevices: selectedCameras,
  reorderCameras,
  startCameraStream,
  stopCameraStream,
  refreshStreams,
  allCamerasReady,
} = useCameraStore();

const { personCount, running, setIrisData, setRunning } = useIrisStore();
const { sceneCameras, setGizmoRotation } = useSceneCameras();

const calibratingExtrinsics = ref(false);
const calibratingIntrinsics = ref<Set<string>>(new Set());
const intrinsicsCalibDevice = ref<{ device: MediaDeviceInfo; slotIndex: number } | null>(null);
const irisFps = ref(30);
const liveStreamSessionId = ref<string | null>(null);
const liveStreamStatus = ref<string | null>(null);

// --- Multi-camera MPEG-TS live stream state ---
const liveCameraCount = ref(0);
const videoRefs = new Map<number, HTMLVideoElement>();
const livePlayers = new Map<number, ReturnType<typeof mpegts.createPlayer>>();

function setVideoRef(cameraId: number, el: HTMLVideoElement | null) {
  if (el) {
    videoRefs.set(cameraId, el);
  } else {
    videoRefs.delete(cameraId);
  }
}

function destroyPlayer(cameraId: number) {
  const player = livePlayers.get(cameraId);
  if (!player) return;

  try { player.pause(); } catch { /* teardown */ }
  try { player.unload(); } catch { /* teardown */ }
  try { player.detachMediaElement(); } catch { /* teardown */ }
  try { player.destroy(); } catch { /* teardown */ }
  livePlayers.delete(cameraId);
}

function destroyAllPlayers() {
  for (const id of [...livePlayers.keys()]) {
    destroyPlayer(id);
  }
  videoRefs.clear();
  liveCameraCount.value = 0;
}

async function attachCameraPlayer(cameraId: number, baseWsUrl: string) {
  destroyPlayer(cameraId);

  await nextTick();

  const videoElement = videoRefs.get(cameraId);
  if (!videoElement) {
    console.warn(`[iris] video element not ready for camera ${cameraId}`);
    return;
  }

  if (!mpegts.isSupported() || !mpegts.getFeatureList().mseLivePlayback) {
    liveStreamStatus.value = 'This device does not support MPEG-TS live playback.';
    return;
  }

  const wsUrl = `${baseWsUrl}/camera/${cameraId}`;
  const player = mpegts.createPlayer(
    {
      type: 'mse',
      isLive: true,
      hasAudio: false,
      hasVideo: true,
      url: wsUrl,
    },
    {
      enableStashBuffer: false,
      liveSync: true,
      liveSyncMaxLatency: 1.5,
      liveSyncTargetLatency: 0.8,
    },
  );

  player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: string) => {
    console.error(`[iris] camera ${cameraId} video error: ${errorType} (${errorDetail})`);
  });

  livePlayers.set(cameraId, player);

  player.attachMediaElement(videoElement);
  player.load();

  try {
    await Promise.resolve(player.play());
  } catch (err) {
    console.warn(`[iris] camera ${cameraId} autoplay blocked`, err);
  }
}

async function connectLiveStreams(baseWsUrl: string, cameraCount: number) {
  destroyAllPlayers();
  liveCameraCount.value = cameraCount;
  liveStreamStatus.value = 'Connecting live video feeds...';

  // Wait for Vue to render the video elements
  await nextTick();

  // Connect all cameras in parallel so every WS client subscribes before
  // any early-buffered MPEG-TS data (PAT/PMT/IDR) is dropped.
  await Promise.all(
    Array.from({ length: cameraCount }, (_, i) => attachCameraPlayer(i, baseWsUrl)),
  );

  liveStreamStatus.value = null;
}

function disconnectLiveStreams() {
  destroyAllPlayers();
}

function clearLiveStreamState() {
  liveStreamSessionId.value = null;
  liveStreamStatus.value = null;
}

const deviceColour = ref<Record<string, string>>({});
const dragSourceIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragEnterCounters = ref<Record<number, number>>({});
const irisWorker = ref<{
    ok: boolean, 
    sessionId: string,
    configPath: string,
    pipeStarted: boolean,
    wsUrl: string | null,
  }>()
function syncDeviceColours() {
  (selectedCameras.value ?? []).forEach((camera, index) => {
    const colour = sceneCameras.value[index]?.color ?? '';
    if (colour && !deviceColour.value[camera.deviceId]) {
      deviceColour.value[camera.deviceId] = colour;
    }
  });
}

function onDragStart(index: number) {
  dragSourceIndex.value = index;
}

function onDragEnter(index: number) {
  if (dragSourceIndex.value === null || dragSourceIndex.value === index) return;
  dragEnterCounters.value[index] = (dragEnterCounters.value[index] ?? 0) + 1;
  dragOverIndex.value = index;
}

function onDragLeave(index: number) {
  dragEnterCounters.value[index] = (dragEnterCounters.value[index] ?? 1) - 1;
  if (dragEnterCounters.value[index] <= 0) {
    dragEnterCounters.value[index] = 0;
    if (dragOverIndex.value === index) dragOverIndex.value = null;
  }
}

async function onDrop(targetIndex: number) {
  const from = dragSourceIndex.value;
  dragEnterCounters.value = {};
  if (from === null || from === targetIndex || !selectedCameras.value) return;

  const reordered = [...selectedCameras.value];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(targetIndex, 0, moved);
  await reorderCameras(reordered);
  dragSourceIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragSourceIndex.value = null;
  dragOverIndex.value = null;
  dragEnterCounters.value = {};
}

function rotateCamera(device: MediaDeviceInfo, index: number) {
  const current = cameraRotation.value[device.deviceId] ?? 0;
  const next = (current + 90) % 360;
  cameraRotation.value[device.deviceId] = next;
  setGizmoRotation(index, next);

  void applyCameraRotation(device.deviceId, next, index, async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } });
    return stream.getVideoTracks()[0].getSettings().aspectRatio ?? 16 / 9;
  });
}

// ── Camera streams ───────────────────────────────────────────────────────────
async function stopCameraStream(index: number) {
  try {
    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
    const stream = video.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {
    console.log('Cameras are gone');
  }
}

async function startCameraStream(camera: MediaDeviceInfo, index: number) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: camera.deviceId }, frameRate: 30 } });
    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
    if (video) video.srcObject = stream;
  } catch (err) {
    console.error('Camera access failed:', err);
  }
}

async function onStartIris() {
  if (!selectedCameras.value || running.value) return;

  const allCameras = (await navigator.mediaDevices.enumerateDevices()).filter((e) => e.kind === 'videoinput');

  const cameras = selectedCameras.value.map((device) => ({
    uri: String(allCameras.findIndex((e) => e.deviceId === device.deviceId)),
    width: 1920,
    height: 1080,
    fps: 100,
    rotation: cameraRotation.value[device.deviceId] ?? 0,
  }));

  const options = {
    kp_format: 'halpe26',
    subjects: personCount.value,
    cameras,
    camera_width: 1920,
    camera_height: 1080,
    video_fps: irisFps.value,
    output_dir: '',
    stream: true,
  };

  selectedCameras.value.forEach((_, index) => {
    stopCameraStream(index);
  });

  setRunning(true);
  liveStreamStatus.value = 'Starting IRIS...';

  try {
    if (!options.stream) {
      return;
    }

    const response = await window.ipc?.startIRISFull?.(options);

    if (!response?.ok) {
      console.warn('[iris] failed to start live stream:', response?.error);
      setRunning(false);
      clearLiveStreamState();
      await Promise.all((selectedCameras.value ?? []).map((device, index) => startCameraStream(device, index)));
      return;
    }

    liveStreamSessionId.value = response.baseSessionId ?? response.sessionId ?? null;

    if (response.wsUrl) {
      await connectLiveStreams(response.wsUrl, cameras.length);
    } else {
      liveStreamStatus.value = 'Pose streaming is active, but no live video URL was returned.';
    }
  } catch (err) {
    console.error('[iris] failed to start stream', err);
    setRunning(false);
    disconnectLiveStreams();
    clearLiveStreamState();
    await Promise.all((selectedCameras.value ?? []).map((device, index) => startCameraStream(device, index)));
  }
}

async function onStopIris() {
  const sessionId = liveStreamSessionId.value;

  disconnectLiveStreams();
  clearLiveStreamState();
  setRunning(false);
  await window.ipc?.stopIRISFull(sessionId);

  await Promise.all((selectedCameras.value ?? []).map((device, index) => startCameraStream(device, index)));
  setIrisData(null);
}

onMounted(() => {
  void refreshStreams();
});

onBeforeUnmount(() => {
  disconnectLiveStreams();

  if (liveStreamSessionId.value) {
    void window.ipc?.stopIRISFull(liveStreamSessionId.value);
  }
});

watch(selectedCameras, syncDeviceColours, { immediate: true, deep: true });
watch(sceneCameras, syncDeviceColours, { immediate: true, deep: true });

window.ipc?.intrinsicsComplete((data: { idx: number; path: string }) => {
  const device = devices.value[data.idx];
  if (!device) return;

  const next = new Set(calibratingIntrinsics.value);
  next.delete(device.deviceId);
  calibratingIntrinsics.value = next;
  intrinsicsCalibDevice.value = null;

  const succeeded = data.path && data.path !== 'None';
   
  const selectedIndex = selectedDeviceIds.value?.indexOf(device.deviceId) ?? -1;
  if (selectedIndex >= 0) {
    void startCameraStream(device, selectedIndex);
  }
});

window.ipc?.extrinsicsComplete((data: { ok: boolean; message?: string; error?: string }) => {
  calibratingExtrinsics.value = false;
  (selectedCameras.value ?? []).forEach((device, index) => {
    void startCameraStream(device, index);
  }); 

  if (data.ok) {
    console.log('[extrinsics] calibration complete:', data.message);
  } else {
    console.warn('[extrinsics] calibration failed or timed out:', data.error);
  }
});
</script>

<style scoped>
.panel-root {
  display: contents;
}

.drag-handle {
  cursor: grab;
  font-size: 18px;
  color: rgba(255,255,255,0.25);
  line-height: 1;
  user-select: none;
  margin-right: 4px;
  transition: color 0.15s;
}
.drag-handle:hover { color: rgba(255,255,255,0.6); }

.drag-item { 
  border-radius: 10px; 
}
.drag-item.drag-over {
  outline: 2px solid rgba(100, 180, 255, 0.6);
  outline-offset: 2px;
  border-radius: 10px;
}

.camera-list {
  padding: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  margin: 5px 0;
}

.stream-preview {
  padding: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  margin: 5px 0;
}

.stream-preview-title {
  justify-content: flex-start;
}

.camera-grid {
  display: grid;
  gap: 6px;
  width: 100%;
}
.camera-grid.grid-cols-1 {
  grid-template-columns: 1fr;
}
.camera-grid.grid-cols-2 {
  grid-template-columns: 1fr 1fr;
}

.camera-video-wrapper {
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
}

.camera-video-label {
  font-size: 11px;
  padding: 3px 6px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.25);
}

.camera-video {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
  background: black;
  object-fit: contain;
}

.stream-status {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.65);
}

.camera-text {
  display: flex;
  flex-direction: row;
  font-size: 14px;
  align-items: center;
  padding-bottom: 5px;
  justify-content: space-between;
}

.button {
  border: 1px solid rgba(255,255,255,0.06);
  background: var(--sidebar);
  border-radius: 10px;
}
.button:hover { background: rgba(18,27,36,0.72); }
.button:active { background: rgba(12,18,25,0.808); }
.button:disabled { opacity: 0.4; cursor: not-allowed; }

.cameras {
  height: 75%;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  overflow-x: hidden;
}

.iris-controls {
  padding: 10px 5px;
  background-color: var(--sidebar);
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 100;
}
.iris-controls button { margin: 5px 0; }

.iris-controls :disabled { 
  opacity: 0.5;
  transition: none;
  transform: none;
  box-shadow: none;
  cursor: default;
}

.button:hover:disabled  { 
  background: var(--sidebar)
}

.button:active:disabled  { 
  background: var(--sidebar)
}

.calibrate-extrinsics-btn {
  width: 90%;
  font-size: 12px;
  color: rgba(255, 200, 80, 0.9);
  border-color: rgba(255, 200, 80, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.calibrate-extrinsics-btn:disabled { opacity: 0.4; }

.warming-up {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin: 6px 0 2px;
}
.warming-spinner {
  border-color: rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.7);
}

.calibrate-intrinsics-btn {
  width: 100%;
  font-size: 11px;
  color: rgba(255, 200, 80, 0.9);
  border-color: rgba(255, 200, 80, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.calibrate-intrinsics-btn:disabled { opacity: 0.4; }

.calib-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 200, 80, 0.3);
  border-top-color: rgba(255, 200, 80, 0.9);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.parent {
  margin: 0 auto;
  width: 190.5px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  column-gap: 10px;
}

.grid1 {
  grid-column: span 2 / span 2;
  grid-column-start: 2;
}

.grid2 {
  grid-column-start: 4;
}

.grid3 {
  grid-column: span 2 / span 2;
  grid-column-start: 2;
  grid-row-start: 2;
}

.cameraGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 0px;
}
</style>
