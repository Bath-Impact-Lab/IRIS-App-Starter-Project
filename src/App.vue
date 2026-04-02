<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import { useProject } from '@/lib/useProject';
import { useIris, type IrisStartOptions } from '@/lib/useIris';

// ── Layout & Core UI ─────────────────────────────────────────────────────────
import AppTopBar from '@/components/app/AppTopBar.vue';
import SessionSidenav from '@/components/app/SessionSidenav.vue';
import Toolbar from '@/components/app/Toolbar.vue';

// ── Pages / Views ────────────────────────────────────────────────────────────
import ProjectHome from '@/components/ProjectHome.vue';
import FeedViewPage from '@/components/FeedViewPage.vue';
import ThreeWindow from '@/components/threeWindow.vue';
import AnalysisWindow from '@/components/analysisWindow.vue';

// ── Modals & Overlays ────────────────────────────────────────────────────────
import SettingsModal from '@/components/settingsModal.vue';

const { 
  hasCurrentProject, 
  currentProject, 
  recentProjects,
  createProject, 
  openProject,
  setCurrentProject
} = useProject();
const {
  cameras: irisCameras,
  isRunning: isIrisRunning,
  isStarting: isStartingIris,
  isStopping: isStoppingIris,
  wsUrl: irisWsUrl,
  start: startIris,
  stop: stopIris,
} = useIris({ autoFetch: true, autoCheck: false });

// View State Routing
const activeView = computed(() => currentProject.value?.workspace.activeView || 'capture');

// Global Settings State
const showSettings = ref(false);
const currentTheme = ref<'dark' | 'light'>('light');
const irisRunMode = ref<'capture' | 'mocap' | null>(null);
const isRecording = ref(false);
const isRecordingBusy = ref(false);

// Apply theme to document root for global CSS variable targeting
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', currentTheme.value);
});

// View Navigation Handler
function setView(view: 'capture' | 'mocap' | 'analysis') {
  if (currentProject.value) {
    currentProject.value.workspace.activeView = view;
  }
}

const selectedResolution = computed(() => currentProject.value?.workspace.resolution ?? '1920x1080');
const selectedFps = computed(() => currentProject.value?.workspace.fps ?? 30);
const selectedRotation = computed(() => currentProject.value?.workspace.rotation ?? 0);
const selectedCameraIds = computed(() => currentProject.value?.workspace.selectedCameraIds ?? []);
const projectOutputDir = computed(() => getParentDirectory(currentProject.value?.path));
const availableIrisCameras = computed(() => {
  if (selectedCameraIds.value.length === 0) return irisCameras.value;
  return irisCameras.value.filter((camera) => selectedCameraIds.value.includes(String(camera.id)));
});
const isCaptureIrisRunning = computed(() =>
  isIrisRunning.value && irisRunMode.value === 'capture'
);
const isMocapIrisRunning = computed(() =>
  isIrisRunning.value && irisRunMode.value === 'mocap'
);
const canStartCaptureIris = computed(() =>
  availableIrisCameras.value.length > 0
  && !isStartingIris.value
  && !isStoppingIris.value
  && !isCaptureIrisRunning.value
);
const canStartMocapIris = computed(() =>
  availableIrisCameras.value.length > 0
  && !isStartingIris.value
  && !isStoppingIris.value
  && !isMocapIrisRunning.value
);
const canStopIris = computed(() =>
  isIrisRunning.value && !isStoppingIris.value && !isStartingIris.value
);
const canToggleRecording = computed(() =>
  !!currentProject.value?.path
  && !isRecordingBusy.value
  && (isRecording.value || isIrisRunning.value)
);

function updateResolution(value: string) {
  if (!currentProject.value) return;
  currentProject.value.workspace.resolution = value;
}

function updateFps(value: number) {
  if (!currentProject.value) return;
  currentProject.value.workspace.fps = value;
}

function updateRotation(value: number) {
  if (!currentProject.value) return;
  currentProject.value.workspace.rotation = value;
}

function parseResolution(value: string) {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { width: 1920, height: 1080 };
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function getParentDirectory(filePath: string | null | undefined) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return '';
  return filePath.replace(/[\\/][^\\/]+$/, '');
}

function buildIrisOptions(mode: 'capture' | 'mocap'): IrisStartOptions | null {
  if (!currentProject.value || availableIrisCameras.value.length === 0) return null;
  const { width, height } = parseResolution(selectedResolution.value);
  return {
    kp_format: 'halpe26',
    subjects: currentProject.value.workspace.personCount,
    cameras: availableIrisCameras.value.map((camera) => ({
      uri: String(camera.id),
      width,
      height,
      fps: selectedFps.value,
      rotation: selectedRotation.value,
    })),
    camera_width: width,
    camera_height: height,
    video_fps: selectedFps.value,
    rotation: selectedRotation.value,
    output_dir: projectOutputDir.value,
    capture_only: mode === 'capture',
    stream: true,
  };
}

async function startIrisForMode(mode: 'capture' | 'mocap') {
  if (isStartingIris.value || isStoppingIris.value) {
    return { ok: false, error: 'IRIS is busy.' };
  }

  if (isIrisRunning.value && irisRunMode.value === mode) {
    return { ok: true, alreadyRunning: true };
  }

  if (isIrisRunning.value) {
    const stopResult = await stopIris();
    if (!stopResult?.ok) {
      return stopResult;
    }
    irisRunMode.value = null;
  }

  const options = buildIrisOptions(mode);
  if (!options) {
    return { ok: false, error: 'No available cameras.' };
  }

  const result = await startIris(options);
  if (result?.ok) {
    irisRunMode.value = mode;
  }

  return result;
}

watch(isIrisRunning, (running) => {
  if (!running && !isStartingIris.value) {
    irisRunMode.value = null;
  }
});

watch(() => currentProject.value?.path ?? null, async (nextPath, previousPath) => {
  if (!previousPath || nextPath === previousPath || !isRecording.value) return;
  if (!window.ipc?.stopIrisRecord) return;

  isRecordingBusy.value = true;
  try {
    const result = await window.ipc.stopIrisRecord();
    if (result?.ok) {
      isRecording.value = false;
    }
  } finally {
    isRecordingBusy.value = false;
  }
});

async function handleStartCaptureIris() {
  await startIrisForMode('capture');
}

async function handleStartIris() {
  await startIrisForMode('mocap');
}

async function handleStopIris() {
  const result = await stopIris();
  if (result?.ok) {
    irisRunMode.value = null;
  }
}

async function handleToggleRecording() {
  if (!currentProject.value?.path || isRecordingBusy.value) return;
  if (!window.ipc?.startIrisRecord || !window.ipc?.stopIrisRecord) return;

  isRecordingBusy.value = true;

  try {
    if (isRecording.value) {
      const result = await window.ipc.stopIrisRecord();
      if (result?.ok) {
        isRecording.value = false;
      }
      return;
    }

    const result = await window.ipc.startIrisRecord({
      projectPath: currentProject.value.path,
      fps: selectedFps.value,
      savePoses: true,
    });

    if (result?.ok) {
      isRecording.value = true;
    }
  } finally {
    isRecordingBusy.value = false;
  }
}
</script>

<template>
  <div id="app-container" :data-theme="currentTheme">
    
    <AppTopBar 
      appTitle="ReCapture" 
      :disabled="!hasCurrentProject"
      @toggle-settings="showSettings = !showSettings" 
      @navigate-home="setCurrentProject(null)"
    />

    <ProjectHome 
      v-if="!hasCurrentProject" 
      :recentProjects="recentProjects"
      @new-project="createProject()" 
      @open-project="openProject()"
      @open-recent="openProject($event)"
    />

    <template v-else>
      <SessionSidenav 
        :activeView="activeView"
        :participants="currentProject.participants"
        @open-capture="setView('capture')"
        @open-mocap="setView('mocap')"
        @open-analysis="setView('analysis')"
      />

      <main class="workspace-content">
        <div v-if="activeView === 'capture'" class="capture-stage">
          <div class="capture-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              :rotation="selectedRotation"
              :show-start-button="true"
              :show-stop-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isCaptureIrisRunning"
              :is-recording="isRecording"
              :start-disabled="!canStartCaptureIris"
              :stop-disabled="!canStopIris"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @start-iris="handleStartCaptureIris"
              @stop-iris="handleStopIris"
              @toggle-recording="handleToggleRecording"
            />
          </div>
          <FeedViewPage
            :cameras="availableIrisCameras"
            :ws-url="irisWsUrl"
          />
        </div>
        <div v-else-if="activeView === 'mocap'" class="mocap-stage">
          <div class="mocap-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              :rotation="selectedRotation"
              :show-start-button="true"
              :show-stop-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isMocapIrisRunning"
              :is-recording="isRecording"
              :start-disabled="!canStartMocapIris"
              :stop-disabled="!canStopIris"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @start-iris="handleStartIris"
              @stop-iris="handleStopIris"
              @toggle-recording="handleToggleRecording"
            />
          </div>
          <ThreeWindow />
        </div>
        <AnalysisWindow v-else-if="activeView === 'analysis'" />
      </main>
 
    </template>

    <SettingsModal 
      :showSettings="showSettings" 
      :currentTheme="currentTheme"
      @settings="showSettings = $event" 
      @setTheme="currentTheme = $event"
    />
    
  </div>
</template>

<style scoped>
#app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-content {
  position: absolute;
  /* Top Bar Height | Right Sidebar Width | Bottom | Left Sidenav Width */
  inset: var(--app-topbar-height, 63px) 0 0 var(--app-session-sidenav-width, 240px);
  overflow: hidden;
  background: var(--bg);
}

.capture-stage,
.mocap-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.mocap-stage :deep(.scene) {
  position: absolute;
  inset: 0;
}

.capture-toolbar-shell,
.mocap-toolbar-shell {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 20;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
}

.capture-toolbar-shell > *,
.mocap-toolbar-shell > * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .workspace-content {
    inset: var(--app-topbar-height, 63px) 0 0 0;
  }

  .capture-toolbar-shell,
  .mocap-toolbar-shell {
    top: 12px;
    left: 12px;
    right: 12px;
  }
}
  
</style>
