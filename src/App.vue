<template>
  <div id="app-container" :class="{ 'sidebar-open': hasCameraSelected }">
    <AppTopBar
      :app-title="appTitle"
      :disabled="IrisState.running"
      @toggle-settings="toggleSignIn"
      @navigate-home="openHome"
    />

    <ProjectHome
      v-if="currentScreen === 'home'"
      @quick-demo="openWorkspace"
      :recent-projects="recentProjects"
      @new-project="createNewProject"
      @open-project="handleOpenProject"
      @open-recent="openRecentProject"
    />

    <template v-else>
      <SessionSidenav
        :active-view="activeView"
        :participants="currentProject?.participants ?? []"
        @open-capture="openCaptureView"
        @open-mocap="openMocapView"
        @open-analysis="openAnalysisView"
      />

      <sidebar
        v-if="hasCameraSelected"
        :person-count="personCount"
        :iris-data="irisData"
        :selected-cameras="selectedDevices"
        :scene-cameras="sceneCameras"
        :camera-rotation="cameraRotation"
        :devices="devices"
        :selected-camera-ids="selectedDeviceId"
        :playback-video-urls="fsPlaybackVideoUrls"
        :is-playing-back="isPlaying"
        @iris-data-update="irisDataUpdate"
        @reorder-cameras="reorderCameras"
      />

      <FeedViewPage
        v-if="activeView === 'capture'"
        :devices="devices"
        :selected-cameras="selectedDevices ?? []"
        :camera="primarySelectedCameraId"
        :resolution="selectedResolution"
        :fps="selectedFps"
        @update:camera="updatePrimaryCamera"
        @update:resolution="selectedResolution = $event"
        @update:fps="selectedFps = $event"
      />

      <template v-else-if="activeView === 'mocap'">
        <div class="capture-toolbar-shell">
          <Toolbar
            :devices="devices"
            :camera="primarySelectedCameraId"
            :resolution="selectedResolution"
            :fps="selectedFps"
            @update:camera="updatePrimaryCamera"
            @update:resolution="selectedResolution = $event"
            @update:fps="selectedFps = $event"
          />
        </div>

        <ThreeWindow
          class="capture-scene"
          :selected-camera-count="selectedCameraCount"
          :iris-data="irisData"
          :spheres-mesh="spheresMesh"
          :skeleton-line="skeletonLine"
          :rebuild-play-space="rebuildPlaySpace"
          :create-play-space="createPlaySpace"
          :add-scene-cameras="addSceneCameras"
          @give-sphere-mesh="sphereMeshUpdate"
          @give-skeleton-mesh="skeletonMeshUpdate"
        >
          <SceneHudControls
            :show-play-space="showPlaySpace"
            :show-cameras="showCameras"
            @toggle-play-space="showPlaySpace = !showPlaySpace"
            @toggle-cameras="showCameras = !showCameras"
          />
        </ThreeWindow>
      </template>
      <AnalysisWindow v-else />

      <StatusOverlays
        :running="IrisState.running"
        :fps="irisDisplayFps"
        :is-valid-license="isValidLicense"
        :plan-type="planType"
        :joint-angles-pretty="jointAnglesPretty"
        @open-settings="showSettings = true"
      />
    </template>

    <!-- Settings Modal -->
    <settingsModal
      :show-settings="showSettings"
      :current-theme="currentTheme"
      @settings="updateSettings"
      @license-key="updateLicenseKey"
      @set-theme="applyTheme"
    />

    <RenameRecordingModal
      :show="showRenameModal"
      :recording-name="fsSelectedRecording?.name ?? ''"
      :error="renameError"
      @close="closeRenameModal"
      @submit="submitRename"
    />

    <IrisMissingModal :show="showIrisNotFound" @download="openIrisDownload" />

  </div>

</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue';
import * as THREE from 'three';
import { useCameras } from './lib/useCameras';
import { useSceneCameras } from './lib/useSceneCameras';
import { useLicense } from './lib/useLicense';
import { usePlaySpace } from './lib/usePlaySpace';
import AppTopBar from './components/app/AppTopBar.vue';
import SessionSidenav from './components/app/SessionSidenav.vue';
import SceneHudControls from './components/app/SceneHudControls.vue';
import StatusOverlays from './components/app/StatusOverlays.vue';
import RenameRecordingModal from './components/app/RenameRecordingModal.vue';
import IrisMissingModal from './components/app/IrisMissingModal.vue';
import Toolbar from './components/app/Toolbar.vue';
import sidebar from './components/sidebar.vue';
import ThreeWindow from './components/threeWindow.vue';
import AnalysisWindow from './components/analysisWindow.vue';
import FeedViewPage from './components/FeedViewPage.vue';
import ProjectHome from './components/ProjectHome.vue';
import settingsModal from './components/settingsModal.vue';
import { useIrisStore } from './Stores/irisStore';
import { useProject, type ProjectDocument } from './lib/useProject';

const appTitle = import.meta.env.VITE_APP_TITLE as string || 'Example App';

const IrisState = useIrisStore()
const {
  currentProject,
  recentProjects,
  createProject,
  openProject,
  updateCurrentProject,
} = useProject();

// ── Theme ──
const currentTheme = ref<'dark' | 'light'>('light');
function applyTheme(theme: 'dark' | 'light') {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);
}

// Sign-in state
const showSettings = ref(false);
const licenseKeyInput = ref('');
const {
  licenseKey: storedLicenseKey,
  isValid: isValidLicense,
  planType,
} = useLicense();
const currentScreen = ref<'home' | 'workspace'>('home');
const activeView = ref<'capture' | 'mocap' | 'analysis'>('capture');

// Sync local input with stored key on mount
watch(storedLicenseKey, (newKey) => {
  licenseKeyInput.value = newKey;
}, { immediate: true });

const cameraRotation = ref<Record<string, number>>({});

const {
  devices,
  selectedDeviceId,
  selectedDevices,
  init: initCameras,
  dispose: disposeCameras,
} = useCameras({
  autoReselect: true,
  onSend: (msg) => { try { lastSentMsg.value = JSON.stringify(msg, null, 2); } catch {} },
});

// Construct scene camera
const selectedCameraCount = computed(() => selectedDevices.value?.length ?? 0);
// Also show the sidebar during filesystem playback when video files exist
const fsVideoFiles = ref<{ index: number; name: string; path: string }[]>([]);
// Resolved file:// URLs for each video, indexed by position â€” bound directly to sidebar <video :src>
const fsPlaybackVideoUrls = ref<(string | null)[]>([]);
const hasCameraSelected = computed(() =>
  (!!selectedDevices.value && selectedDevices.value.length > 0) ||
  (outputOption.value === 'Filesystem' && fsVideoFiles.value.length > 0)
);

const showPlaySpace = ref(true);
const showCameras = ref(true);

const {
  sceneCameras,
  addToScene: addSceneCameras,
  computePlaySpaceBounds,
  dispose: disposeSceneCameras
} = useSceneCameras(selectedCameraCount, showCameras, showCameras);

// Person count options
const personCount = ref<string | null>('Single Person');
const selectedResolution = ref('1920x1080');
const selectedFps = ref(30);

// Output always uses Filesystem
const outputOption = ref<string>('Filesystem');


// Filesystem recordings dropdown
const fsRecordingsDir = ref<string | null>(null);
const fsRecordings = ref<{ name: string; path: string }[]>([]);
const fsSelectedRecording = ref<{ name: string; path: string } | null>(null);

async function refreshRecordings() {
  if (!fsRecordingsDir.value) return;
  const ipc = (window as any).ipc;
  if (ipc?.fsListRecordings) {
    fsRecordings.value = await ipc.fsListRecordings(fsRecordingsDir.value);
    // Do NOT auto-select â€” default is always "New Recording" (null)
  }
}

// Rename recording modal
const showRenameModal = ref(false);
const renameError = ref('');
const isApplyingProject = ref(false);

function closeRenameModal() {
  showRenameModal.value = false;
  renameError.value = '';
}

async function submitRename(trimmed: string) {
  if (!trimmed || !fsSelectedRecording.value) return;
  if (trimmed === fsSelectedRecording.value.name) { closeRenameModal(); return; }

  const ipc = (window as any).ipc;
  if (ipc?.fsRenameRecording) {
    const result = await ipc.fsRenameRecording(fsSelectedRecording.value.path, trimmed);
    if (!result.ok) { renameError.value = result.error; return; }
    // Update local state to reflect the rename
    fsSelectedRecording.value = { name: trimmed, path: result.newPath };
    await refreshRecordings();
    // Re-select the renamed entry
    fsSelectedRecording.value = fsRecordings.value.find(r => r.path === result.newPath) ?? null;
  }
  closeRenameModal();
}

// When Filesystem is selected, auto-load the default recordings directory
watch(outputOption, async (val, oldVal) => {
  if (val === 'Filesystem' && !fsRecordingsDir.value) {
    const ipc = (window as any).ipc;
    if (ipc?.fsGetDefaultRecordingsDir) {
      fsRecordingsDir.value = await ipc.fsGetDefaultRecordingsDir();
      await refreshRecordings();
    }
  }
  // When leaving Filesystem mode, clear synthetic playback cameras
  if (oldVal === 'Filesystem' && val !== 'Filesystem') {
    isPlaying.value = false;
    stopFsTimer();
    fsPositions.value = [];
    fsVideoFiles.value = [];
    fsPlaybackVideoUrls.value = [];
    fsFrameIndex.value = 0;
    fsPlaybackSeconds.value = 0;
    // Remove synthetic devices if no real cameras were selected
    if (selectedDevices.value?.every(d => d.deviceId.startsWith('fs-playback-'))) {
      selectedDevices.value = null;
      selectedDeviceId.value = null;
    }
  }
});


// Filesystem record / playback state
const isRecording = ref(false);
const isPlaying = ref(false);

// Loaded position frames for the currently selected recording
const fsPositions = ref<IrisData[]>([]);
const fsFrameIndex = ref(0);

// Playback controls are disabled when no recording is selected or positions aren't loaded
const playbackDisabled = computed(() => isRecording.value || !fsSelectedRecording.value || fsPositions.value.length === 0);
const fsPlaybackSeconds = ref(0);
const fsDuration = ref(0);
const timelineHoverX = ref<number | null>(null);
let fsPlaybackTimer: ReturnType<typeof setInterval> | null = null;
let fsRecordTimer: ReturnType<typeof setInterval> | null = null;

// Refresh the recordings list whenever a recording finishes
watch(isRecording, async (val) => {
  if (!val) {
    await refreshRecordings();
    // Stay on "New Recording" â€” user can manually select the recording they just made
  }
});

// Load position frames + video URLs whenever a recording is selected
watch(fsSelectedRecording, async (rec) => {
  // Stop any active playback
  isPlaying.value = false;
  stopFsTimer();
  fsFrameIndex.value = 0;
  fsPlaybackSeconds.value = 0;
  fsPositions.value = [];
  fsDuration.value = 0;
  fsVideoFiles.value = [];
  fsPlaybackVideoUrls.value = [];

  if (!rec) {
    // Back to "New Recording" â€” remove synthetic playback devices so CameraLivePanel shows
    if (selectedDevices.value?.every(d => d.deviceId.startsWith('fs-playback-'))) {
      selectedDevices.value = null;
      selectedDeviceId.value = null;
    }
    return;
  }

  const ipc = (window as any).ipc;
  if (!ipc?.fsGetRecordingData) return;

  const data = await ipc.fsGetRecordingData(rec.path);

  if (Array.isArray(data?.positions) && data.positions.length > 0) {
    fsPositions.value = data.positions;
    fsDuration.value = Math.floor(data.positions.length / 30);
  }

  // Build synthetic MediaDeviceInfo-like entries for each video file
  // so the sidebar renders the video feeds even without real cameras
  if (Array.isArray(data?.videoFiles) && data.videoFiles.length > 0) {
    fsVideoFiles.value = data.videoFiles;

    // Only replace selectedDevices if no real cameras are active
    if (!selectedDevices.value || selectedDevices.value.length === 0) {
      selectedDevices.value = data.videoFiles.map((vf: { index: number; name: string; path: string }) => ({
        deviceId: `fs-playback-${vf.index}`,
        groupId: '',
        kind: 'videoinput' as MediaDeviceKind,
        label: vf.name,
        toJSON: () => ({}),
      } as MediaDeviceInfo));
      selectedDeviceId.value = selectedDevices.value?.map(d => d.deviceId) ?? [];
    }

    // Resolve file:// URLs for each video â€” bound reactively to sidebar <video :src>
    if (ipc.fsGetVideoUrl) {
      const urls: (string | null)[] = new Array(data.videoFiles.length).fill(null);
      await Promise.all(data.videoFiles.map(async (vf: { index: number; path: string }) => {
        urls[vf.index] = await ipc.fsGetVideoUrl(vf.path);
      }));
      fsPlaybackVideoUrls.value = urls;
    }
  }
});

const timelinePercent = computed(() => {
  if (fsPositions.value.length === 0) return 0;
  return Math.min(100, (fsFrameIndex.value / (fsPositions.value.length - 1)) * 100);
});

const fsTimeDisplay = computed(() => {
  const t = fsPlaybackSeconds.value;
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = (t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

function toggleRecording() {
  if (isRecording.value) {
    isRecording.value = false;
    if (fsRecordTimer) { clearInterval(fsRecordTimer); fsRecordTimer = null; }
    // Stop the iris_cli.exe monitor process
    (window as any).ipc?.stopMonitor?.();
  } else {
    isPlaying.value = false;
    stopFsTimer();
    fsPlaybackSeconds.value = 0;
    fsDuration.value = 0;

    // Build a timestamped sub-folder under the recordings root
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recordingName = `recording-${timestamp}`;
    const outputDir = fsRecordingsDir.value
      ? `${fsRecordingsDir.value}\\${recordingName}`
      : recordingName;

    isRecording.value = true;
    fsRecordTimer = setInterval(() => { fsDuration.value++; }, 1000);

    // Spawn iris_cli.exe monitor --output-dir <path>
    (window as any).ipc?.startMonitor?.(outputDir);
  }
}

function togglePlayback() {
  if (isPlaying.value) {
    isPlaying.value = false;
    stopFsTimer();
  } else {
    if (fsPositions.value.length === 0) return;
    // Restart from beginning if we reached the end
    if (fsFrameIndex.value >= fsPositions.value.length - 1) {
      fsFrameIndex.value = 0;
      fsPlaybackSeconds.value = 0;
    }
    isPlaying.value = true;
    // PlaybackPanel watches isPlaying and calls .play() on each video element
    fsPlaybackTimer = setInterval(() => {
      if (fsFrameIndex.value >= fsPositions.value.length - 1) {
        isPlaying.value = false;
        stopFsTimer();
        return;
      }
      fsFrameIndex.value++;
      irisData.value = fsPositions.value[fsFrameIndex.value];
      fsPlaybackSeconds.value = Math.floor(fsFrameIndex.value / 30);
    }, 1000 / 30);
  }
}

function skipBackward() {
  const newFrame = Math.max(0, fsFrameIndex.value - 10 * 30);
  fsFrameIndex.value = newFrame;
  fsPlaybackSeconds.value = Math.floor(newFrame / 30);
  if (fsPositions.value[newFrame]) irisData.value = fsPositions.value[newFrame];
  fsPlaybackVideoUrls.value.forEach((url, i) => {
    if (!url) return;
    const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement | null;
    if (video) video.currentTime = fsPlaybackSeconds.value;
  });
}

function skipForward() {
  const newFrame = Math.min(fsPositions.value.length - 1, fsFrameIndex.value + 10 * 30);
  fsFrameIndex.value = newFrame;
  fsPlaybackSeconds.value = Math.floor(newFrame / 30);
  if (fsPositions.value[newFrame]) irisData.value = fsPositions.value[newFrame];
  fsPlaybackVideoUrls.value.forEach((url, i) => {
    if (!url) return;
    const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement | null;
    if (video) video.currentTime = fsPlaybackSeconds.value;
  });
}

function scrubTimeline(e: MouseEvent) {
  if (playbackDisabled.value || fsPositions.value.length === 0) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const newFrame = Math.round(pct * (fsPositions.value.length - 1));
  fsFrameIndex.value = newFrame;
  fsPlaybackSeconds.value = Math.floor(newFrame / 30);
  if (fsPositions.value[newFrame]) irisData.value = fsPositions.value[newFrame];
  fsPlaybackVideoUrls.value.forEach((url, i) => {
    if (!url) return;
    const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement | null;
    if (video) video.currentTime = fsPlaybackSeconds.value;
  });
}

function onTimelineHover(e: MouseEvent) {
  if (fsPositions.value.length === 0) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  timelineHoverX.value = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
}

function stopFsTimer() {
  if (fsPlaybackTimer) { clearInterval(fsPlaybackTimer); fsPlaybackTimer = null; }
  // PlaybackPanel's watch(isPlaying) handles pause when isPlaying becomes false
}

const lastSentMsg = ref('');
const primarySelectedCameraId = computed(() => selectedDeviceId.value?.[0] ?? '');

const irisDisplayFps = ref(0);
const jointAngles = computed(() => {
  const frame = Array.isArray(irisData.value) ? irisData.value[0] : irisData.value;
  return frame?.people?.[0]?.joint_angles ?? null;
});
const jointAnglesPretty = computed(() => jointAngles.value ? JSON.stringify(jointAngles.value, null, 2) : '');

// ── IRIS CLI presence check ─────────────────────────────────────────────────────────────
const showIrisNotFound = ref(false);
let irisPollTimer: ReturnType<typeof setInterval> | null = null;

async function checkIrisCli() {
  if (import.meta.env.VITE_APP_SKIP_IRIS_INSTALL === 'true') return; // env flag — skip check
  const ipc = (window as any).ipc;
  if (!ipc?.checkIrisCli) return; // not in Electron â€” skip
  const result = await ipc.checkIrisCli();
  if (result.found) {
    showIrisNotFound.value = false;
    if (irisPollTimer) { clearInterval(irisPollTimer); irisPollTimer = null; }
  } else {
    showIrisNotFound.value = false;
    // Start polling every 5 seconds if not already polling
    if (!irisPollTimer) {
      irisPollTimer = setInterval(checkIrisCli, 5000);
    }
  }
}

function openIrisDownload() {
  (window as any).electronAPI?.openExternal('https://iris.cs.bath.ac.uk/');
}

// Skeleton always visible by default

let browserMockTimer: ReturnType<typeof setInterval> | null = null;

let spheresMesh = ref<THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null>(null);
let skeletonLine = ref<THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null>(null);
let irisData = ref<IrisData[] | IrisData | null>(null);

const { create: createPlaySpace, rebuild: rebuildPlaySpace, dispose: disposePlaySpace } = usePlaySpace(showPlaySpace, computePlaySpaceBounds);

function reorderCameras(newOrder: MediaDeviceInfo[]) {
  selectedDevices.value = newOrder;
  selectedDeviceId.value = newOrder.map(d => d.deviceId);
}

function updatePrimaryCamera(deviceId: string) {
  const device = devices.value.find((item) => item.deviceId === deviceId);
  if (!device) return;
  selectedDevices.value = [device];
  selectedDeviceId.value = [device.deviceId];
}

watch(devices, (nextDevices) => {
  if (!selectedDeviceId.value?.length) return;
  if (selectedDeviceId.value.every((id) => id.startsWith('fs-playback-'))) return;

  const matchingDevices = nextDevices.filter((device) => selectedDeviceId.value?.includes(device.deviceId));
  if (matchingDevices.length > 0) {
    selectedDevices.value = matchingDevices;
  }
}, { deep: true });

watch([
  activeView,
  currentTheme,
  selectedResolution,
  selectedFps,
  personCount,
  outputOption,
  fsRecordingsDir,
  () => fsSelectedRecording.value?.path ?? null,
  () => selectedDeviceId.value ? [...selectedDeviceId.value] : [],
], async () => {
  if (isApplyingProject.value || !currentProject.value) return;

  await updateCurrentProject({
    settings: {
      theme: currentTheme.value,
      recordingsDir: fsRecordingsDir.value,
    },
    workspace: {
      activeView: activeView.value,
      selectedCameraIds: selectedDeviceId.value ?? [],
      selectedRecordingPath: fsSelectedRecording.value?.path ?? null,
      resolution: selectedResolution.value,
      fps: selectedFps.value,
      personCount: personCount.value,
      outputOption: outputOption.value,
    },
  }, { save: true });
}, { deep: true });

async function applyProject(project: ProjectDocument) {
  isApplyingProject.value = true;

  currentTheme.value = project.settings.theme;
  applyTheme(project.settings.theme);
  currentScreen.value = 'workspace';
  activeView.value = project.workspace.activeView;
  selectedResolution.value = project.workspace.resolution;
  selectedFps.value = project.workspace.fps;
  personCount.value = project.workspace.personCount;
  outputOption.value = project.workspace.outputOption;
  fsRecordingsDir.value = project.settings.recordingsDir;

  if (outputOption.value === 'Filesystem' && !fsRecordingsDir.value) {
    fsRecordingsDir.value = await window.ipc?.fsGetDefaultRecordingsDir?.() ?? null;
  }

  selectedDeviceId.value = project.workspace.selectedCameraIds.length > 0
    ? [...project.workspace.selectedCameraIds]
    : null;
  selectedDevices.value = selectedDeviceId.value
    ? devices.value.filter((device) => selectedDeviceId.value?.includes(device.deviceId))
    : null;

  if (fsRecordingsDir.value) {
    await refreshRecordings();
  }

  if (project.workspace.selectedRecordingPath) {
    const selectedRecording = fsRecordings.value.find((recording) => recording.path === project.workspace.selectedRecordingPath);
    fsSelectedRecording.value = selectedRecording ?? {
      name: project.workspace.selectedRecordingPath.split(/[\\/]/).pop() ?? 'Selected Recording',
      path: project.workspace.selectedRecordingPath,
    };
  } else {
    fsSelectedRecording.value = null;
  }

  isApplyingProject.value = false;
}

function buildProjectSeed(name?: string) {
  return {
    name: name || 'Untitled Project',
    settings: {
      theme: currentTheme.value,
      recordingsDir: fsRecordingsDir.value,
    },
    workspace: {
      activeView: 'capture' as const,
      selectedCameraIds: [],
      selectedRecordingPath: null,
      resolution: selectedResolution.value,
      fps: selectedFps.value,
      personCount: personCount.value,
      outputOption: outputOption.value,
    },
  };
}

async function createNewProject() {
  const project = await createProject(buildProjectSeed());
  if (!project) return;
  await applyProject(project);
}

async function handleOpenProject() {
  const project = await openProject();
  if (!project) return;
  await applyProject(project);
}

onMounted(() => {
  // Restore saved theme
  const savedTheme = (localStorage.getItem('app-theme') as 'dark' | 'light') || 'light';
  applyTheme(savedTheme);

  initCameras();

  // Check whether iris_cli.exe is installed; show modal + poll if not
  checkIrisCli();

  // Load filesystem recordings directory on startup
  const ipc = (window as any).ipc;
  if (ipc?.fsGetDefaultRecordingsDir) {
    ipc.fsGetDefaultRecordingsDir().then((dir: string) => {
      fsRecordingsDir.value = dir;
      refreshRecordings();
    });
  }

  window.ipc?.onIrisData((data) => {
    irisData.value = data
  })

  // Browser fallback: when not in Electron, stream mock pose data directly
  if (!(window as any).ipc) {
    fetch('/assets/mock-halpe26-stream.json')
        .then(r => r.json())
        .then((positions: IrisData[]) => {
          if (!Array.isArray(positions) || positions.length === 0) return;
          let frame = 0;
          browserMockTimer = setInterval(() => {
            irisData.value = positions[frame];
            frame = (frame + 1) % positions.length;
          }, 1000 / 30);
        })
        .catch(err => console.warn('[browser mock] could not load mock-halpe26-stream.json', err));
  }
});

onBeforeUnmount(() => {
  disposeCameras();
  disposeSceneCameras();
  disposePlaySpace();
  if (browserMockTimer) { clearInterval(browserMockTimer); browserMockTimer = null; }
  stopFsTimer();
  if (fsRecordTimer) { clearInterval(fsRecordTimer); fsRecordTimer = null; }
  if (irisPollTimer) { clearInterval(irisPollTimer); irisPollTimer = null; }
});

function toggleSignIn() {
  showSettings.value = !showSettings.value;
}

function sphereMeshUpdate(value: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null) {
  spheresMesh.value = value
}

function skeletonMeshUpdate(value: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null) {
  skeletonLine.value = value
}

function irisDataUpdate(value: IrisData[] | IrisData | null) {
  irisData.value = value
}

function updateSettings(value: boolean) {
  showSettings.value = value
}

function updateLicenseKey(value: string) {
  licenseKeyInput.value = value
}

function openCaptureView() {
  currentScreen.value = 'workspace';
  activeView.value = 'capture';
}

function openMocapView() {
  currentScreen.value = 'workspace';
  activeView.value = 'mocap';
}

function openAnalysisView() {
  currentScreen.value = 'workspace';
  activeView.value = 'analysis';
}

function openWorkspace() {
  currentScreen.value = 'workspace';
  activeView.value = 'capture';
}

async function openRecentProject(path: string) {
  const project = await openProject(path);
  if (!project) return;
  await applyProject(project);
}

function openHome() {
  currentScreen.value = 'home';
}

</script>

<style>
.capture-toolbar-shell {
  position: absolute;
  top: var(--app-topbar-height, 63px);
  left: var(--app-session-sidenav-width, 240px);
  right: 0;
  z-index: 11;
  padding: 12px 16px 0;
  pointer-events: none;
}

.capture-toolbar-shell > * {
  pointer-events: auto;
}

.sidebar-open .capture-toolbar-shell {
  right: var(--app-sidebar-width, 250px);
}

.capture-scene {
  inset: var(--app-topbar-height, 63px) 0 0 var(--app-session-sidenav-width, 240px) !important;
}

.sidebar-open .capture-scene {
  right: var(--app-sidebar-width, 250px) !important;
}

@media (max-width: 768px) {
  .capture-toolbar-shell {
    left: 0;
    right: 0;
    padding: 12px 12px 0;
  }

  .sidebar-open .capture-toolbar-shell {
    right: 0;
  }

  .capture-scene,
  .sidebar-open .capture-scene {
    inset: var(--app-topbar-height, 63px) 0 0 0 !important;
  }
}
</style>
