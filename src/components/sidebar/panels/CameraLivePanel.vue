<template>
  <div class="panel-root">
    <!-- Camera feed list -->
    <div class="cameras">
      <div
        v-for="(d, i) in props.selectedCameras"
        :key="d.deviceId"
        style="width: 100%;"
        draggable="true"
        :class="['drag-item', { 'drag-over': dragOverIndex === i, 'dragging': dragSourceIndex === i }]"
        @dragstart="onDragStart(i)"
        @dragenter.prevent="onDragEnter(i)"
        @dragover.prevent
        @dragleave="onDragLeave(i)"
        @drop.prevent="onDrop(i)"
        @dragend="onDragEnd"
      >
        <div
          class="camera-list"
          :style="{
            width: '100%',
            boxShadow: deviceColour[d.deviceId] ? `inset 4px 0 0 ${deviceColour[d.deviceId]}` : 'none',
            paddingLeft: deviceColour[d.deviceId] ? '8px' : '0',
          }"
        >
          <div class="camera-text">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            {{ d.label ? d.label.split(' ')[0] + ' ' : '' }}{{ deviceShortCode(d.deviceId) }}
            <button class="button btn" style="padding: 3px 5px;" @click="rotateCamera(d, i)" :disabled="running">
              <img style="width: 30px;" src="/assets/anticlockwise-2-line.svg" alt="" />
            </button>
          </div>

          <div :id="`camera-box${i}`">
            <video
              style="width: 100%;"
              :id="`cameraFeed${i}`"
              autoplay
              playsinline
              muted
            />
          </div>

          <div>
            <button class="button btn" style="margin-top: 5px;" @click="onCalibrateIntrinsics(d)">
              calibrate intrinsics
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- IRIS engine controls -->
    <div class="iris-controls">
      <!-- Extrinsics calibration — spans all cameras -->
      <button
        class="button btn calibrate-extrinsics-btn"
        @click="onCalibrateExtrinsics"
        :disabled="running || calibratingExtrinsics || props.selectedCameras.length < 2"
        :title="props.selectedCameras.length < 2 ? 'Select at least 2 cameras' : 'Hold ArUco marker in front of ALL cameras, then click'"
      >
        <span v-if="calibratingExtrinsics" class="calib-spinner"></span>
        {{ calibratingExtrinsics ? 'Calibrating…' : 'Calibrate Extrinsics' }}
      </button>
      <button class="button btn" @click="onStartIris" :disabled="running">Start IRIS</button>
      <button class="button btn" @click="onStopIris" :disabled="!running">Stop IRIS</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useSceneCameras, SceneCameraEntry } from '../../../lib/useSceneCameras';
import { deviceShortCode, applyCameraRotation } from '../useCameraFeedUtils';
import * as THREE from 'three';

interface Props {
  selectedCameras: MediaDeviceInfo[];
  selectedCameraIds: string[] | null;
  sceneCameras: SceneCameraEntry[];
  cameraRotation: Record<string, number>;
  devices: MediaDeviceInfo[];
  personCount: string | null;
  spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null;
  skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null;
  scene: THREE.Scene | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  sphereUpdate: [THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null];
  skeletonUpdate: [THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null];
  irisDataUpdate: [IrisData[] | IrisData | null];
  isRunning: [boolean];
  reorderCameras: [MediaDeviceInfo[]];
}>();

// ── Running state ────────────────────────────────────────────────────────────
const running = ref(false);
const calibratingExtrinsics = ref(false);

// ── Scene camera gizmo rotation ──────────────────────────────────────────────
const selectedCameraCount = computed(() => props.selectedCameras.length);
const { setGizmoRotation } = useSceneCameras(selectedCameraCount);

// ── Device colour accents ────────────────────────────────────────────────────
const deviceColour = ref<Record<string, string>>({});

function syncDeviceColours() {
  props.selectedCameras.forEach((d, i) => {
    const colour = props.sceneCameras[i]?.color ?? '';
    if (colour && !deviceColour.value[d.deviceId]) {
      deviceColour.value[d.deviceId] = colour;
    }
  });
}

watch(() => props.selectedCameras, syncDeviceColours, { immediate: true, deep: true });
watch(() => props.sceneCameras, syncDeviceColours, { immediate: true, deep: true });

// ── Drag-and-drop reorder ────────────────────────────────────────────────────
const dragSourceIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragEnterCounters = ref<Record<number, number>>({});

function onDragStart(index: number) { dragSourceIndex.value = index; }

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

function onDrop(targetIndex: number) {
  const from = dragSourceIndex.value;
  dragEnterCounters.value = {};
  if (from === null || from === targetIndex) return;
  const reordered = [...props.selectedCameras];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(targetIndex, 0, moved);
  emit('reorderCameras', reordered);
  dragSourceIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragSourceIndex.value = null;
  dragOverIndex.value = null;
  dragEnterCounters.value = {};
}

// ── Camera rotation ──────────────────────────────────────────────────────────
const localCameraRotation = ref<Record<string, number>>({ ...props.cameraRotation });

function rotateCamera(d: MediaDeviceInfo, index: number) {
  const current = localCameraRotation.value[d.deviceId] ?? 0;
  const next = (current + 90) % 360;
  localCameraRotation.value[d.deviceId] = next;
  setGizmoRotation(index, next);
  applyCameraRotation(d.deviceId, next, index, async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId } } });
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

// ── Intrinsics calibration ───────────────────────────────────────────────────
async function onCalibrateIntrinsics(d: MediaDeviceInfo) {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'videoinput');
  const idx = cams.findIndex(c => c.deviceId === d.deviceId);
  const slotIndex = props.selectedCameras.indexOf(d);
  if (slotIndex >= 0) stopCameraStream(slotIndex);
  await window.ipc?.calculateIntrinsics(idx, localCameraRotation.value[d.deviceId]);
}

// ── Extrinsics calibration ───────────────────────────────────────────────────
async function onCalibrateExtrinsics() {
  if (calibratingExtrinsics.value) return;
  calibratingExtrinsics.value = true;

  // Resolve system camera indices for each selected device
  const allCams = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'videoinput');
  const cameraIndices = props.selectedCameras.map(d => {
    const idx = allCams.findIndex(c => c.deviceId === d.deviceId);
    return idx >= 0 ? idx : 0;
  });

  // Stop live streams so iris_cli.exe can access the cameras
  props.selectedCameras.forEach((_, i) => stopCameraStream(i));

  await window.ipc?.calculateExtrinsics(cameraIndices);
}

// ── IRIS engine ──────────────────────────────────────────────────────────────
async function onStartIris() {
  emit('sphereUpdate', null);
  emit('skeletonUpdate', null);

  const cameras = props.selectedCameras.map((d, i) => ({
    uri: String(i),
    width: 1920,
    height: 1080,
    fps: 100,
    rotation: localCameraRotation.value[d.deviceId] ?? 0,
  }));

  const options = {
    kp_format: 'halpe26',
    subjects: props.personCount,
    cameras,
    camera_width: 1920,
    camera_height: 1080,
    video_fps: 100,
    output_dir: '',
    stream: true,
  };

  props.selectedCameras.forEach((_, i) => stopCameraStream(i));
  running.value = true;
  emit('isRunning', true);
  await window.ipc?.startIRIS(options);
}

async function onStopIris() {
  running.value = false;
  emit('isRunning', false);

  await window.ipc?.stopIRIS('example');

  props.selectedCameras.forEach((d, i) => startCameraStream(d, i));

  if (props.spheresMesh && props.scene) props.scene.remove(props.spheresMesh);
  emit('sphereUpdate', null);

  if (props.skeletonLine && props.scene) props.scene.remove(props.skeletonLine);
  emit('skeletonUpdate', null);
  emit('irisDataUpdate', null);
}

// ── Intrinsics completion callback ───────────────────────────────────────────
// Registered once here; the panel owns this concern.
window.ipc?.intrinsicsComplete((data: { idx: number }) => {
  const device = props.devices[data.idx];
  if (!device) return;
  const index = props.selectedCameraIds?.indexOf(device.deviceId) ?? -1;
  if (index >= 0) startCameraStream(device, index);
});

// ── Extrinsics completion callback ───────────────────────────────────────────
window.ipc?.extrinsicsComplete((data: { ok: boolean; message?: string; error?: string }) => {
  calibratingExtrinsics.value = false;
  // Restart live streams now that iris_cli.exe has released the cameras
  props.selectedCameras.forEach((d, i) => startCameraStream(d, i));
  if (data.ok) {
    console.log('[extrinsics] calibration complete:', data.message);
  } else {
    console.warn('[extrinsics] calibration failed or timed out:', data.error);
  }
});
</script>

<style scoped>
.panel-root {
  display: contents; /* transparent wrapper — sidenav layout owns spacing */
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

.drag-item { border-radius: 10px; }
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
</style>

