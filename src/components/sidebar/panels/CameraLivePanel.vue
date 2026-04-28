<template>
  <div class="panel-root">
    <!-- Camera feed list -->
    <div class="cameras">
      <div class="cameraGrid">
        <div
          v-for="(d, i) in props.selectedCameras"
          :key="d.deviceId"
          style="width: 225px;"
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
            }"
          >
            <div class="camera-text">
              <span class="drag-handle" title="Drag to reorder">⠿</span>
              {{ d.label ? d.label.split(' ')[0] + ' ' : '' }}{{ deviceShortCode(d.deviceId) }}
              <button class="button btn" style="padding: 3px 5px;" @click="rotateCamera(d, i)" :disabled="IrisState.running">
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
              ></video>
            </div>

            <div>

            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- IRIS engine controls -->
    <div class="iris-controls">

      <div class="parent">
        <button class="button btn grid1" @click="onStartIris" :disabled="IrisState.running">Start IRIS</button>
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
import { ref, watch, computed, reactive, onMounted } from 'vue';
import { useSceneCameras, SceneCameraEntry } from '../../../lib/useSceneCameras';
import { deviceShortCode, applyCameraRotation } from '../useCameraFeedUtils';
import { useIrisStore } from '@/Stores/irisStore';

interface Props {
  selectedCameras: MediaDeviceInfo[];
  selectedCameraIds: string[] | null;
  sceneCameras: SceneCameraEntry[];
  cameraRotation: Record<string, number>;
  devices: MediaDeviceInfo[];
  personCount: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  irisDataUpdate: [IrisData[] | IrisData | null];
  reorderCameras: [MediaDeviceInfo[]];
}>();

// ── IRIS state ────────────────────────────────────────────────────────────
const IrisState = useIrisStore()

// ── Config Options ─────────────────────────────────────────────────────────────
const irisFps = ref<number>(30)


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
const irisWorker = ref<{
    ok: boolean, 
    sessionId: string,
    configPath: string,
    pipeStarted: boolean,
    wsUrl: string | null,
  }>()
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

// ── IRIS engine ──────────────────────────────────────────────────────────────
async function onStartIris() {

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
    video_fps: irisFps.value,
    output_dir: '',
    stream: true,
  };

  props.selectedCameras.forEach((_, i) => stopCameraStream(i));
  IrisState.setRunningState(true)
  irisWorker.value = await window.ipc?.startIRIS(options);
  if (options.stream) await window.ipc?.startIRISStream?.(options);
}

async function onStopIris() {
  IrisState.setRunningState(false)

  await window.ipc?.stopIRIS(irisWorker.value?.sessionId);
  await new Promise(resolve => setTimeout(resolve, 3000));
  props.selectedCameras.forEach((d, i) => startCameraStream(d, i));
  emit('irisDataUpdate', null);
}

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
  max-width: 225px;
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
  /* row-gap: 5px; */
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

