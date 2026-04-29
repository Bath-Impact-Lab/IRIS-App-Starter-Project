<template>
  <div id="app-container" :class="{ 'sidebar-open': hasCameraSelected }">
    <Transition name="fade">
      <div v-if="anyDropdownOpen" class="dropdown-overlay" @click="closeAllDropdowns"></div>
    </Transition>

    <Navbar />

    <Sidebar v-if="hasCameraSelected" />

    <ThreeWindow />

    <ConnectVR v-if="outputOption === 'VR Chat'" />

    <HudControls />

    <div class="hud hud-right">
      <div
        class="license-badge-container"
        :class="{ 'clickable': !isValidLicense || planType === 'Trial' }"
        @click="(!isValidLicense || planType === 'Trial') ? showSettings = true : null"
      >
        <div v-if="isValidLicense" class="badge glass">
          <span class="badge-dot" :class="planType?.toLowerCase()"></span>
          <span class="badge-text">{{ planType || 'Trial' }} License</span>
        </div>
        <div v-else class="badge-upgrade glass">
          <svg class="badge-trial-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <span class="badge-text">FREE Trial</span>
          <div class="upgrade-action">
            Upgrade
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>
    </div>

    <div v-if="jointAngles" class="debug" aria-live="polite">
      <div class="debug-title">Joint Angles</div>
      <pre class="debug-pre">{{ jointAnglesPretty }}</pre>
    </div>

    <SettingsModal :show-settings="showSettings" @settings="updateSettings" />

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
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
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
import { onBeforeUnmount, onMounted } from 'vue';
import Sidebar from './components/sidebar.vue';
import Navbar from './components/Navbar.vue';
import ThreeWindow from './components/threeWindow.vue';
import SettingsModal from './components/settingsModal.vue';
import ConnectVR from './components/connectVR.vue';
import HudControls from './components/HudControls.vue';
import RenameRecordingModal from './components/modals/RenameRecordingModal.vue';
import IrisMissingModal from './components/modals/IrisMissingModal.vue';
import { useLicense } from './lib/useLicense';
import { usePlaySpace } from './lib/usePlaySpace';
import { useSceneCameras } from './lib/useSceneCameras';
import { useCameraStore } from './stores/useCameraStore';
import { useFilesystemStore } from './stores/useFilesystemStore';
import { useIrisStore } from './stores/useIrisStore';
import { useUIStore } from './stores/useUIStore';

const splitRef = ref<HTMLElement | null>(null);
// Individual dropdown open flags
const openCamera = ref(false);
const openPersonCount = ref(false);
const openTrack = ref(false);
const openOutput = ref(false);
const openAvatar = ref(false);
// Camera menu focus + ARIA state
const cameraButtonRef = ref<HTMLButtonElement | null>(null);
const cameraListRef = ref<HTMLElement | null>(null);
const cameraActiveIndex = ref(0);
// Dropdown management
const anyDropdownOpen = computed(() => openCamera.value || openPersonCount.value || openTrack.value || openOutput.value || openAvatar.value);
function closeAllDropdowns() {
  openCamera.value = false;
  openPersonCount.value = false;
  openTrack.value = false;
  openOutput.value = false;
  openAvatar.value = false;
}

// Sign-in state
const showSettings = ref(false);
const licenseKeyInput = ref('');
>>>>>>> main
const {
  isValid: isValidLicense,
  planType,
} = useLicense();

let irisPollTimer: ReturnType<typeof setInterval> | null = null;

async function checkIrisCli() {
  if (import.meta.env.VITE_APP_SKIP_IRIS_INSTALL === 'true') return;
  if (!window.ipc?.checkIrisCli) return;

  const result = await window.ipc.checkIrisCli();
  if (result.found) {
    setShowIrisNotFound(false);
    if (irisPollTimer) {
      clearInterval(irisPollTimer);
      irisPollTimer = null;
    }
    return;
  }

  setShowIrisNotFound(true);
  if (!irisPollTimer) {
    irisPollTimer = setInterval(() => {
      void checkIrisCli();
    }, 5000);
  }
}

function openSettings() {
  if (!isValidLicense.value || planType.value === 'Trial') {
    setShowSettings(true);
  }
<<<<<<< HEAD
=======
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
  if (irisPollTimer) {
    clearInterval(irisPollTimer);
    irisPollTimer = null;
  }
});
</script>

<style>
@import './App.css';
</style>
