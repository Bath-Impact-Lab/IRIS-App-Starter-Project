<template>
  <div id="app-container" :class="{ 'sidebar-open': hasCameraSelected }">
    <!-- Global Overlay for Dropdowns -->
    <Transition name="fade">
      <div v-if="anyDropdownOpen" class="dropdown-overlay" @click="closeAllDropdowns"></div>
    </Transition>

    <nav class="navbar">
      <div class="brand">
        <img
          v-if="!logoError"
          :src="`/assets/logo/${appTitle.toLowerCase()}.png`"
          :alt="appTitle"
          class="brand-logo"
          @error="logoError = true"
        />
        <template v-else>
          <div class="split" ref="splitRef">{{ appTitle }}</div>
        </template>
      </div>
      <div class="menu">
        <!-- Camera selection dropdown -->
        <div class="dropdown" :class="{ open: openCamera }">
          <button
              class="btn"
              ref="cameraButtonRef"
              @click="toggleCamera"
              @keydown="onCameraButtonKeydown"
              aria-haspopup="listbox"
              :aria-expanded="openCamera"
              aria-controls="camera-listbox"
              :disabled="running"
          >
            <div class="btn-content">
              <svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              <span class="btn-text">
                <template v-if="!selectedDevices">Camera Selection</template>
                <template v-else>Add More Cameras</template>
              </span>
            </div>
          </button>
          <div
              class="dropdown-menu"
              id="camera-listbox"
              ref="cameraListRef"
              role="listbox"
              tabindex="0"
              :aria-activedescendant="activeCameraOptionId"
              @keydown="onCameraListKeydown"
          >
            <h4>Detected cameras</h4>
            <div v-if="devices.length === 0" class="device">
              <div>
                <div>No cameras found</div>
                <small>We are showing demo mode for now.</small>
              </div>
            </div>
            <div
                v-for="(d, i) in devices"
                :key="d.deviceId"
                class="device"
                role="option"
                :id="'cam-opt-' + i"
                :aria-selected="i === cameraHoverIndex"
                :class="{ hovered: i === cameraHoverIndex, active: selectedDevices != null && selectedDeviceId?.includes(d.deviceId) }"
                @click="selectDevice(d, i)"
            >
              <div>
                <div>{{ deviceShortCode(d.deviceId) }}</div>
                <small v-if="d.label">{{ d.label }}</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Person count dropdown -->
        <div class="dropdown" :class="{ open: openPersonCount }" style="margin-left: 12px;">
          <button class="btn" @click="togglePersonCount" :disabled="running">
            <div class="btn-content">
              <svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span class="btn-text">{{ personCount || 'Person Count' }}</span>
            </div>
          </button>
          <div class="dropdown-menu">
            <h4>Subjects</h4>
            <div class="device" v-for="p in personCountOptions" :key="p" @click="selectPersonCount(p)">
              <div>
                <div>{{ p }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tracking type dropdown -->
        <div class="dropdown" :class="{ open: openTrack }" style="margin-left: 12px;">
          <button class="btn" @click="toggleTrack" :disabled="running">
            <div class="btn-content">
              <svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              <span class="btn-text">{{ trackingType || 'Tracking Type' }}</span>
            </div>
          </button>
          <div class="dropdown-menu">
            <h4>Tracking</h4>
            <div class="device" v-for="t in trackingOptions" :key="t" @click="selectTracking(t)">
              <div>
                <div>{{ t }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Filesystem recordings dropdown -->
        <select
          class="btn fs-recordings-select"
          style="margin-left: 12px;"
          :disabled="running"
          :value="fsSelectedRecording?.path ?? ''"
          @change="onRecordingSelectChange"
        >
          <option value="">{{ fsRecordings.length ? 'Select Recording' : 'No Recordings' }}</option>
          <option v-for="r in fsRecordings" :key="r.path" :value="r.path">{{ r.name }}</option>
        </select>
        <button
          v-if="fsSelectedRecording"
          class="hud-icon-btn"
          style="margin-left: 6px; flex-shrink: 0;"
          @click="openRenameModal"
          title="Rename recording"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

      </div>

      <!-- Right side: sign-in area -->
      <div class="nav-right">
        <div class="menu-right">
          <button class="btn btn-icon" @click="toggleSignIn" aria-label="Settings" :disabled="running">
            <img src="/assets/settings.svg" alt="">
          </button>
        </div>
      </div>
    </nav>

    <aside class="session-sidenav">
      <div class="session-sidenav-top">
        <h2 class="session-sidenav-title">Sessions</h2>
        <div class="session-sidenav-list">
          <button class="session-sidenav-link" type="button">16/4/2026</button>
          <button class="session-sidenav-link" type="button">16/4/2026</button>
          <button class="session-sidenav-link" type="button">16/4/2026</button>
          <button class="session-sidenav-link" type="button">16/4/2026</button>
        </div>
      </div>

      <div class="session-sidenav-divider"></div>

      <div class="session-sidenav-bottom">
        <button class="session-sidenav-action" type="button">Calibrate Rig</button>
        <button class="session-sidenav-action" type="button">Calibrate Patient</button>
        <button class="session-sidenav-action" :class="{ active: activeView === 'capture' }" type="button" @click="openCaptureView">Capture Session</button>
        <button class="session-sidenav-action" :class="{ active: activeView === 'analysis' }" type="button" @click="openAnalysisView">Biomechanics analysis</button>
      </div>
    </aside>


    <sidebar
      v-if="hasCameraSelected"
      :spheres-mesh="spheresMesh"
      :skeleton-line="skeletonLine" 
      :person-count="personCount" 
      :scene="scene" 
      :iris-data="irisData"
      :selected-cameras="selectedDevices"
      :scene-cameras="sceneCameras"
      :camera-rotation="cameraRotation"
      :devices="devices"
      :selected-camera-ids="selectedDeviceId"
      :playback-video-urls="fsPlaybackVideoUrls"
      :is-playing-back="isPlaying"
      @sphere-update="sphereMeshUpdate"
      @skeleton-update="skeletonMeshUpdate"
      @iris-data-update="irisDataUpdate"
      @is-running="runningUpdate"
      @reorder-cameras="reorderCameras"
    />

    <ThreeWindow
      v-if="activeView === 'capture'"
      :selected-camera-count="selectedCameraCount"
      :iris-data="irisData"
      :spheres-mesh="spheresMesh"
      :skeleton-line="skeletonLine"
      :rebuild-play-space="rebuildPlaySpace"
      :create-play-space="createPlaySpace"
      :add-scene-cameras="addSceneCameras"
      :test="test"
      @give-scene="asignScene"
      @give-sphere-mesh="sphereMeshUpdate"
      @give-skeleton-mesh="skeletonMeshUpdate"
    />
    <AnalysisWindow v-else />

    <!-- Filesystem Record / Playback bar -->
    <Transition name="fs-bar">
      <div class="hud hud-fs" v-if="outputOption === 'Filesystem'">


        <!-- Record side -->
        <div class="fs-group">
          <button
            class="hud-icon-btn fs-btn"
            :class="{ 'fs-recording': isRecording }"
            @click="toggleRecording"
            :title="isRecording ? 'Stop Recording' : 'Start Recording'"
          >
            <!-- Record dot / stop square -->
            <svg v-if="!isRecording" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
          <div v-if="isRecording" class="fs-rec-indicator">
            <span class="fs-rec-dot"></span>
            <span class="fs-rec-bar" style="--d:0ms; --h:10px"></span>
            <span class="fs-rec-bar" style="--d:120ms; --h:18px"></span>
            <span class="fs-rec-bar" style="--d:60ms; --h:14px"></span>
            <span class="fs-rec-bar" style="--d:180ms; --h:20px"></span>
            <span class="fs-rec-bar" style="--d:30ms; --h:12px"></span>
          </div>
          <span v-else class="fs-label fs-rec-label">Record</span>
        </div>

        <div class="fs-sep"></div>

        <!-- Playback side -->
        <div class="fs-group">
          <button class="hud-icon-btn fs-btn" @click="skipBackward" title="Skip Backward" :disabled="playbackDisabled">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="3" height="16"/>
            </svg>
          </button>
          <button
            class="hud-icon-btn fs-btn"
            :class="{ active: isPlaying }"
            @click="togglePlayback"
            :title="isPlaying ? 'Pause' : 'Play'"
            :disabled="playbackDisabled"
          >
            <svg v-if="!isPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <button class="hud-icon-btn fs-btn" @click="skipForward" title="Skip Forward" :disabled="playbackDisabled">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,4 15,12 5,20"/><rect x="16" y="4" width="3" height="16"/>
            </svg>
          </button>
          <!-- Timeline scrubber -->
          <div class="fs-timeline" :class="{ 'fs-timeline-disabled': playbackDisabled }" @click="scrubTimeline" @mousemove="onTimelineHover" @mouseleave="timelineHoverX = null">
            <div class="fs-timeline-track">
              <div class="fs-timeline-fill" :style="{ width: timelinePercent + '%' }"></div>
              <div class="fs-timeline-thumb" :style="{ left: timelinePercent + '%' }"></div>
              <div v-if="timelineHoverX !== null" class="fs-timeline-hover" :style="{ left: timelineHoverX + '%' }"></div>
            </div>
          </div>
          <span class="fs-label fs-time" :class="{ 'fs-time-disabled': playbackDisabled }">{{ fsTimeDisplay }}</span>
        </div>
      </div>
    </Transition>

    <div class="hud">
      <button
        class="hud-icon-btn"
        :class="{ active: showPlaySpace }"
        @click="showPlaySpace = !showPlaySpace"
        title="Toggle Playspace"
        aria-label="Toggle Playspace"
      >
        <!-- floor/grid icon -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </button>
      <button
        class="hud-icon-btn"
        :class="{ active: showCameras }"
        @click="showCameras = !showCameras"
        title="Toggle Cameras"
        aria-label="Toggle Cameras"
      >
        <!-- camera icon -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 7l-7 5 7 5V7z"/>
          <rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </button>
    </div>
    <div class="hud hud-center" v-if="running">
      <span class="activity-blinker"></span>
      <span class="hud-item">IRIS Engine</span>
      <div class="hud-sep"></div>
      <span class="hud-item fps-counter">{{ irisDisplayFps }} <span class="fps-unit">FPS</span></span>
    </div>

    <!-- License Badge â€” bottom-centre pill -->
    <div v-if="isValidLicense" class="hud hud-right">
      <div
        class="license-badge-container"
        :class="{ 'clickable': planType === 'Trial' }"
        @click="planType === 'Trial' ? showSettings = true : null"
      >
        <div class="badge glass">
          <span class="badge-dot" :class="planType?.toLowerCase()"></span>
          <span class="badge-text">{{ planType || 'Trial' }} License</span>
        </div>
      </div>
    </div>
    <!-- Settings Modal -->
    <settingsModal
      :show-settings="showSettings"
      :current-theme="currentTheme"
      @settings="updateSettings"
      @license-key="updateLicenseKey"
      @set-theme="applyTheme"
    />

    <!-- Rename Recording Modal -->
    <Transition name="fade">
      <div v-if="showRenameModal" class="rename-overlay" @click.self="closeRenameModal">
        <div class="rename-dialog">
          <button class="rename-dialog-close" @click="closeRenameModal">Ã—</button>
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
              @keyup.enter="submitRename"
              @keyup.esc="closeRenameModal"
            />
            <p v-if="renameError" class="rename-error">{{ renameError }}</p>
          </div>
          <div class="rename-modal-footer">
            <button class="btn rename-cancel" @click="closeRenameModal">Cancel</button>
            <button class="btn rename-confirm" @click="submitRename" :disabled="!renameValue.trim() || renameValue === fsSelectedRecording?.name">Save</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- IRIS not installed modal -->
    <Transition name="fade">
      <div v-if="showIrisNotFound" class="iris-missing-overlay">
        <div class="iris-missing-dialog">
          <div class="iris-missing-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 class="iris-missing-title">IRIS Engine Not Found</h2>
          <p class="iris-missing-body">
            Please download and install IRIS to continue.
          </p>
          <a
            class="btn iris-missing-download-btn"
            href="#"
            @click.prevent="openIrisDownload"
          >
            Download IRIS from iris.cs.bath.ac.uk
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <p class="iris-missing-checking">
            <span class="iris-missing-pulse"></span>
            Checking for installation
          </p>
        </div>
      </div>
    </Transition>

  </div>

</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { useCameras } from './lib/useCameras';
import { useSceneCameras } from './lib/useSceneCameras';
import { useLicense } from './lib/useLicense';
import { usePlaySpace } from './lib/usePlaySpace';
import sidebar from './components/sidebar.vue';
import ThreeWindow from './components/threeWindow.vue';
import AnalysisWindow from './components/analysisWindow.vue';
import settingsModal from './components/settingsModal.vue';

const appTitle = import.meta.env.VITE_APP_TITLE as string || 'Example App';
const logoError = ref(false);

// ── Theme ──
const currentTheme = ref<'dark' | 'light'>('light');
function applyTheme(theme: 'dark' | 'light') {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);
}

const splitRef = ref<HTMLElement | null>(null);
// Individual dropdown open flags
const openCamera = ref(false);
const openPersonCount = ref(false);
const openTrack = ref(false);
const openOutput = ref(false);
// Camera menu focus + ARIA state
const cameraButtonRef = ref<HTMLButtonElement | null>(null);
const cameraListRef = ref<HTMLElement | null>(null);
const cameraActiveIndex = ref(0);
// Dropdown management
const anyDropdownOpen = computed(() => openCamera.value || openPersonCount.value || openTrack.value || openOutput.value);
function closeAllDropdowns() {
  openCamera.value = false;
  openPersonCount.value = false;
  openTrack.value = false;
  openOutput.value = false;
}

// Sign-in state
const showSettings = ref(false);
const licenseKeyInput = ref('');
const {
  licenseKey: storedLicenseKey,
  isValid: isValidLicense,
  isChecking,
  error: licenseError,
  planType,
  validateLicense,
  logout: licenseLogout
} = useLicense();

const isPaidLicense = computed(() => {
  if (!isValidLicense.value) return false;
  const plan = planType.value?.toLowerCase();
  return plan === 'creator' || plan === 'studio';
});

const test = ref<boolean>(false)
const activeView = ref<'capture' | 'analysis'>('capture');

// Sync local input with stored key on mount
watch(storedLicenseKey, (newKey) => {
  licenseKeyInput.value = newKey;
}, { immediate: true });
const cameraHoverIndex = ref(0);

const cameraRotation = ref<Record<string, number>>({});

const {
  devices,
  selectedDeviceId,
  selectedDevices,
  enumerateCameras,
  selectDevice: selectCamera,
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
  syncVisibility,
  setGizmoRotation,
  computePlaySpaceBounds,
  dispose: disposeSceneCameras
} = useSceneCameras(selectedCameraCount, showCameras, showCameras);

const activeCameraOptionId = computed(() => (devices.value.length > 0 ? `cam-opt-${cameraHoverIndex.value}` : undefined));

// Tracking options
const trackingOptions = ['Full body', 'Hand', 'Face'];
const trackingType = ref<string | null>('Full body');

// Person count options
const personCountOptions = ['Single Person', 'Multi-Person'];
const personCount = ref<string | null>('Single Person');

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

function onRecordingSelectChange(e: Event) {
  const path = (e.target as HTMLSelectElement).value;
  // Empty string = "New Recording" sentinel â€” clear selection so live panel shows
  fsSelectedRecording.value = path ? (fsRecordings.value.find(r => r.path === path) ?? null) : null;
}

// Rename recording modal
const showRenameModal = ref(false);
const renameValue = ref('');
const renameError = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function openRenameModal() {
  renameValue.value = fsSelectedRecording.value?.name ?? '';
  renameError.value = '';
  showRenameModal.value = true;
  nextTick(() => { renameInputRef.value?.select(); });
}

function closeRenameModal() {
  showRenameModal.value = false;
  renameError.value = '';
}

async function submitRename() {
  const trimmed = renameValue.value.trim();
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

const running = ref(false);
const irisDisplayFps = ref(0);

// â”€â”€ IRIS CLI presence check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    showIrisNotFound.value = true;
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

let scene =  ref<THREE.Scene | null>(null);
let spheresMesh = ref<THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null>(null);
let skeletonLine = ref<THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null>(null);
let irisData = ref<IrisData[] | IrisData | null>(null);

const { create: createPlaySpace, rebuild: rebuildPlaySpace, dispose: disposePlaySpace } = usePlaySpace(showPlaySpace, computePlaySpaceBounds);

function onCameraButtonKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!openCamera.value) {
      openCamera.value = true; openTrack.value = false; openOutput.value = false;
      setInitialCameraActiveIndex(e.key === 'ArrowDown' ? 'first' : 'last');
      e.preventDefault();
      focusCameraListSoon();
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    openCamera.value = !openCamera.value;
    if (openCamera.value) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    openCamera.value = false; e.preventDefault();
  }
}

function onCameraListKeydown(e: KeyboardEvent) {
  if (devices.value.length === 0) {
    if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
    return;
  }
  const max = devices.value.length - 1;
  if (e.key === 'ArrowDown') { cameraActiveIndex.value = Math.min(max, cameraActiveIndex.value + 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'ArrowUp') { cameraActiveIndex.value = Math.max(0, cameraActiveIndex.value - 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Home') { cameraActiveIndex.value = 0; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'End') { cameraActiveIndex.value = max; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Enter') { const d = devices.value[cameraActiveIndex.value]; if (d) selectDevice(d, cameraActiveIndex.value); e.preventDefault(); }
  else if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
}

function setInitialCameraActiveIndex(mode: 'first' | 'last' | 'current-or-first'){
  if (devices.value.length === 0) { cameraActiveIndex.value = 0; return; }
  if (mode === 'last') cameraActiveIndex.value = devices.value.length - 1;
  else if (mode === 'current-or-first') {
    const idx = selectedDeviceId.value ? devices.value.findIndex(d => (selectedDeviceId.value ? selectedDeviceId.value : []).includes(d.deviceId)) : -1;
    cameraActiveIndex.value = idx >= 0 ? idx : 0;
  } else cameraActiveIndex.value = 0;
}

function focusCameraListSoon(){ nextTick(() => cameraListRef.value?.focus()); }

function scrollActiveIntoView(){
  nextTick(() => {
    const el = document.getElementById(`cam-opt-${cameraActiveIndex.value}`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function toggleCamera() {
  const willOpen = !openCamera.value;
  openCamera.value = willOpen;
  // close others
  if (willOpen) { openPersonCount.value = false; openTrack.value = false; openOutput.value = false; enumerateCameras(); }
}
function togglePersonCount() {
  const willOpen = !openPersonCount.value;
  openPersonCount.value = willOpen;
  if (willOpen) { openCamera.value = false; openTrack.value = false; openOutput.value = false; }
}
function toggleTrack() {
  const willOpen = !openTrack.value;
  openTrack.value = willOpen;
  if (willOpen) { openCamera.value = false; openPersonCount.value = false; openOutput.value = false; }
}
function toggleOutput() {
  const willOpen = !openOutput.value;
  openOutput.value = willOpen;
  if (willOpen) { openCamera.value = false; openPersonCount.value = false; openTrack.value = false; }
}
function onClickOutside(e: MouseEvent) {
  // close any open dropdown if click outside
  if (!openCamera.value && !openPersonCount.value && !openTrack.value && !openOutput.value) return;
  const dd = (e.target as HTMLElement)?.closest('.dropdown');
  if (!dd) { openCamera.value = false; openPersonCount.value = false; openTrack.value = false; openOutput.value = false; }
}

function reorderCameras(newOrder: MediaDeviceInfo[]) {
  selectedDevices.value = newOrder;
  selectedDeviceId.value = newOrder.map(d => d.deviceId);
}

function selectDevice(d: MediaDeviceInfo, i: number){
  selectCamera(d);

  const isSelected = selectedDevices.value?.some(sd => sd.deviceId === d.deviceId);
  if (isSelected) {
    startCameraStream(d, i);
    // Initialize rotation angle for this device if not already set
    if (cameraRotation.value[d.deviceId] === undefined) {
      cameraRotation.value[d.deviceId] = 0;
    }
  } else {
    stopCameraStream(i);
  }


  refresh();
  if (isSelected) {
    startCameraStream(d, i);
    // Initialize rotation angle for this device if not already set
    if (cameraRotation.value[d.deviceId] === undefined) {
      cameraRotation.value[d.deviceId] = 0;
    }
  } else {
    stopCameraStream(i);
  }
  refresh();
}

async function startCameraStream(camera: MediaDeviceInfo, index: number) {
  const stream = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: camera.deviceId}, frameRate: 30}});

  const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
  try {
    if (video) {
      video.srcObject = stream;
      // console.log("playing", selectedDevices.value);
    }
  } catch (err) {
    console.error("Camera access failed: ", err);
  }
}

function stopCameraStream(index: number) {
  try {
    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
    const stream = video.srcObject as MediaStream;
    const tracks = stream.getTracks();
    
    tracks.forEach(track => {
    track.stop();
    });
    video.srcObject = null;
  }
  catch {
    console.log("Cameras are gone")
  }
}

function refresh() {
  selectedDevices.value?.forEach((d, i) => {
    startCameraStream(d, i)
  })
}

onMounted(() => {
  // Restore saved theme
  const savedTheme = (localStorage.getItem('app-theme') as 'dark' | 'light') || 'light';
  applyTheme(savedTheme);

  document.addEventListener('click', onClickOutside);
  // Trigger split animation
  requestAnimationFrame(() => { splitRef.value?.classList.add('ready'); });

  initCameras();
  watch(openCamera, (isOpen) => {
    if (isOpen) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    else if (document.activeElement === cameraListRef.value) { cameraButtonRef.value?.focus(); }
  });

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
  document.removeEventListener('click', onClickOutside);
  disposeCameras();
  disposeSceneCameras();
  disposePlaySpace();
  if (browserMockTimer) { clearInterval(browserMockTimer); browserMockTimer = null; }
  stopFsTimer();
  if (fsRecordTimer) { clearInterval(fsRecordTimer); fsRecordTimer = null; }
  if (irisPollTimer) { clearInterval(irisPollTimer); irisPollTimer = null; }
});


function selectTracking(t: string) {
  trackingType.value = t;
  openTrack.value = false;
}

function selectPersonCount(p: string) {
  personCount.value = p;
  openPersonCount.value = false;
}

function selectOutput(o: string) {
  outputOption.value = o;
  openOutput.value = false;
}

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

function runningUpdate(value: boolean) {
  running.value = value
}

function asignScene(value: THREE.Scene) {
  scene.value = value
}

function deviceShortCode(deviceId: string): string {
  // Produce a stable 4-char hex code from the deviceId (e.g. "Port #A3F2")
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = (hash * 31 + deviceId.charCodeAt(i)) >>> 0;
  }
  return 'ID #' + (hash & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function updateSettings(value: boolean) {
  showSettings.value = value
}

function updateLicenseKey(value: string) {
  licenseKeyInput.value = value
}

function openCaptureView() {
  activeView.value = 'capture';
}

function openAnalysisView() {
  activeView.value = 'analysis';
}

</script>

<style scoped>
.hud{ position: fixed; left: 236px; bottom: 16px; height: 48px; display:flex; align-items:center; gap:8px; padding:0 10px; background: var(--hud-bg); border:1px solid var(--hud-border); border-radius: 12px; backdrop-filter: blur(10px); }
.hud-right{ left: auto; right: 266px; /* 250px sidenav + 16px gap */ }
@media (max-width: 768px) {
  .hud-right {
    right: 16px;
  }
}
.hud-center{ left: calc(50% - 125px); transform: translateX(-50%); }
.activity-blinker{
  width: 8px; height: 8px; border-radius: 50%;
  background: #6be675;
  box-shadow: 0 0 6px rgba(107,230,117,0.8);
  animation: blink 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes blink{
  0%, 100%{ opacity: 1; box-shadow: 0 0 6px rgba(107,230,117,0.8); }
  50%{ opacity: 0.25; box-shadow: none; }
}
.fps-counter{ font-variant-numeric: tabular-nums; font-size: .85rem; color: var(--fg); font-weight: 700; }
.fps-unit{ font-size: .7rem; font-weight: 600; color: var(--muted); margin-left: 2px; }
.demo-banner{
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  color: var(--muted);
  font-size: .8rem;
  font-weight: 600;
  letter-spacing: .02em;
  pointer-events: none;
  white-space: nowrap;
  z-index: 1;
}
.demo-icon{ display:flex; align-items:center; color: rgba(255,180,50,.7); }
.demo-fade-enter-active, .demo-fade-leave-active{ transition: opacity .4s ease, transform .4s ease; }
.demo-fade-enter-from, .demo-fade-leave-to{ opacity: 0; transform: translateX(-50%) translateY(-6px); }
.hud-item{ display:flex; align-items:center; gap:8px; color:var(--fg); font-weight:600; }
.hud-sep{ width:1px; background:var(--hud-border); margin:0 6px; }
.hud-icon-btn{ display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; border:1px solid var(--hud-border); background:transparent; color:var(--muted); cursor:pointer; transition:color .2s, background .2s, border-color .2s; padding:0; }
.hud-icon-btn:hover{ background:var(--device-hover); color:var(--fg); }
.hud-icon-btn.active{ color:#6be675; border-color:rgba(107,230,117,.4); background:rgba(107,230,117,.08); }
.dot{ width:8px; height:8px; border-radius:50%; display:inline-block; box-shadow:0 0 10px rgba(0,0,0,.5) }
.dot.ok{ background:#6be675 }
.dot.warn{ background:#ff9a5c }
.btn.btn-mini{ padding:6px 10px; font-size:.8rem; border-radius:8px; border:1px solid rgba(255,255,255,.08); background:rgba(26,35,48,.8); color:#e6edf3; cursor:pointer }
.debug{ position: fixed; left: 16px; bottom: 70px; width: 540px; max-width: calc(100vw - 32px); background: rgba(12,18,25,.85); border:1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 10px; backdrop-filter: blur(10px); box-shadow:0 10px 28px rgba(0,0,0,.35) }
.debug-row{ display:flex; gap:10px; align-items:center; margin-bottom:8px }
.debug-col{ flex:1; min-width:0 }
.debug-title{ color:#9fb1c1; font-weight:700; font-size:.8rem; margin-bottom:4px }
.debug-pre{ margin:0; max-height:140px; overflow:auto; background:#0e141b; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.06); color:#cfe2f3; font-size:.78rem }

/* Navbar layout: brand left, menu centered, right side for sign-in */
.navbar{
  position: relative; /* enable absolute-centering of the menu */
  display:flex;
  align-items:center;
  justify-content: space-between; /* keep brand left and right area placed */
  gap:12px;
  padding:12px 18px;
}
.brand{ display:flex; align-items:center; gap:10px; color:#e6edf3; font-weight:700; z-index:2; }
.brand-logo{ height: 28px; width: auto; object-fit: contain; display: block; }
.menu{
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 50%;
  transform-origin: center;
  transform: translate(-50%, -50%); /* center vertically and horizontally inside navbar */
  display:flex;
  align-items:center;
  gap:12px;
  z-index:1;
}
.nav-right{ display:flex; align-items:center; gap:12px; z-index:2; }
.btn-icon{
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 9px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s ease;
}
.btn-icon:hover{
  opacity: 0.85;
}
.btn-icon svg{
  display: block;
}
.btn-icon img {
  filter: none;
}
/* Accessibility focus styles */
.btn:focus-visible, .btn.btn-mini:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.dropdown-menu:focus { outline: none; }
.device.active { background: rgba(107, 230, 117, 0.12); border-radius: 8px; }
.device.active > div > div { color: #e6ffe9; }
[data-theme="light"] .device.active { background: rgba(46, 134, 193, 0.12); }
[data-theme="light"] .device.active > div > div { color: #1F4E79; }
.session-sidenav{
  position: absolute;
  top: 63px;
  left: 0;
  width: 220px;
  height: calc(100% - 63px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
  background: var(--sidebar);
  border-right: 1px solid var(--sidenav-border);
  z-index: 10;
  transition: background 0.3s ease, border-color 0.3s ease;
}
.session-sidenav::-webkit-scrollbar{
  display: none;
}
.session-sidenav-top{
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.session-sidenav-title{
  margin: 0;
  font-size: 1.45rem;
  font-weight: 600;
  color: var(--sidenav-title);
  white-space: nowrap;
}
.session-sidenav-list{
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
}
.session-sidenav-link{
  display: block;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--sidenav-link);
  font-size: 1.06rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-sidenav-link:hover{
  color: var(--sidenav-title);
}
.session-sidenav-divider{
  width: 100%;
  height: 1px;
  margin: 10px 0 12px;
  background: var(--sidenav-divider);
}
.session-sidenav-bottom{
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
.session-sidenav-action{
  display: block;
  width: 100%;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--sidenav-action);
  font-size: 1.06rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-sidenav-action:hover{
  color: var(--muted);
}
.session-sidenav-action.active{
  color: var(--accent);
}

/* License Badge Styles */
.license-badge-container {
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
}

.license-badge-container.clickable {
  cursor: pointer;
}

.license-badge-container.clickable:hover {
  transform: translateY(-2px);
}

.license-badge-container .badge,
.license-badge-container .badge-upgrade {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  backdrop-filter: none;
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
}

.badge.error {
  border-color: rgba(255, 59, 48, 0.3);
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6be675; /* Default to Premium green */
  box-shadow: 0 0 8px rgba(107, 230, 117, 0.4);
}

.badge-dot.trial {
  background: #ff9a5c;
  box-shadow: 0 0 8px rgba(255, 154, 92, 0.4);
}

.badge-dot.invalid {
  background: #ff3b30;
  box-shadow: 0 0 8px rgba(255, 59, 48, 0.4);
}

.badge-trial-icon {
  color: #ff9a5c;
  filter: drop-shadow(0 0 4px rgba(255, 154, 92, 0.6));
  flex-shrink: 0;
}

.badge-text {
  letter-spacing: 0.5px;
}


.upgrade-action {
  background: linear-gradient(135deg, #6be675, #4ecb58);
  color: #0b0f14;
  padding: 6px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(107, 230, 117, 0.2);
}

.license-badge-container.clickable:hover .upgrade-action {
  transform: translateX(2px);
  filter: brightness(1.1);
  box-shadow: 0 4px 15px rgba(107, 230, 117, 0.4);
}

.settings-footer {
  flex-direction: column;
  gap: 16px;
}

.navbar {
  z-index: 200 !important;
}

.dropdown-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 150;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.btn-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-icon-svg {
  display: none;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .hud {
    left: 16px;
  }
  .session-sidenav {
    display: none;
  }
  .navbar {
    padding: 8px 12px;
  }
  .brand {
    gap: 6px;
  }
  .brand-logo {
    height: 24px;
  }
  .menu {
    gap: 6px;
  }
  .btn {
    padding: 8px;
  }
  .btn-text {
    display: none;
  }
  .btn-icon-svg {
    display: block;
  }
  .dropdown-menu {
    position: fixed !important;
    top: 70px !important;
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    width: 90% !important;
    max-width: 340px !important;
    margin: 0 !important;
    z-index: 200 !important;
    border-color: rgba(255, 255, 255, 0.12) !important;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6) !important;
  }
  .dropdown {
    margin-left: 4px !important;
  }
}

</style>

