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
        :class="{ clickable: !isValidLicense || planType === 'Trial' }"
        @click="openSettings"
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

    <RenameRecordingModal />
    <IrisMissingModal />
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

const { hasCameraSelected, init: initCameras, dispose: disposeCameras } = useCameraStore();
const { dispose: disposeFilesystem } = useFilesystemStore();
const { jointAngles, jointAnglesPretty, outputOption, init: initIris, dispose: disposeIris } = useIrisStore();
const {
  anyDropdownOpen,
  closeAllDropdowns,
  showSettings,
  setShowSettings,
  setShowIrisNotFound,
} = useUIStore();
const { dispose: disposeSceneCameras } = useSceneCameras();
const { dispose: disposePlaySpace } = usePlaySpace();

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
}

function updateSettings(value: boolean) {
  setShowSettings(value);
}

onMounted(() => {
  initCameras();
  initIris();
  void checkIrisCli();
});

onBeforeUnmount(() => {
  disposeCameras();
  disposeFilesystem();
  disposeIris();
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
