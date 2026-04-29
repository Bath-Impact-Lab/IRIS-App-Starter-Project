<template>
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
      <div class="dropdown" :class="{ open: dropdowns.camera }">
        <button
          class="btn"
          ref="cameraButtonRef"
          @click="toggleCamera"
          @keydown="onCameraButtonKeydown"
          aria-haspopup="listbox"
          :aria-expanded="dropdowns.camera"
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
            v-for="(device, index) in devices"
            :key="device.deviceId"
            class="device"
            role="option"
            :id="`cam-opt-${index}`"
            :aria-selected="index === cameraActiveIndex"
            :class="{ hovered: index === cameraActiveIndex, active: selectedDeviceIds?.includes(device.deviceId) }"
            @click="selectDevice(device, index)"
          >
            <div>
              <div>{{ deviceShortCode(device.deviceId) }}</div>
              <small v-if="device.label">{{ device.label }}</small>
            </div>
          </div>
        </div>
      </div>

      <div class="dropdown" :class="{ open: dropdowns.personCount }" style="margin-left: 12px;">
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
          <div class="device" v-for="option in personCountOptions" :key="option" @click="selectPersonCountOption(option)">
            <div>
              <div>{{ option }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dropdown" :class="{ open: dropdowns.track }" style="margin-left: 12px;">
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
          <div class="device" v-for="option in trackingOptions" :key="option" @click="selectTrackingOption(option)">
            <div>
              <div>{{ option }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dropdown" :class="{ open: dropdowns.output }" style="margin-left: 12px;">
        <button class="btn" @click="toggleOutput" :disabled="running">
          <div class="btn-content">
            <svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span class="btn-text">{{ outputOption || 'Output' }}</span>
          </div>
        </button>
        <div class="dropdown-menu">
          <h4>Output</h4>
          <div class="device" v-for="option in outputOptions" :key="option" @click="selectOutputOption(option)">
            <div>
              <div>{{ option }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dropdown" :class="{ open: dropdowns.avatar }" style="margin-left: 12px;">
        <button class="btn" @click="toggleAvatar">
          <div class="btn-content">
            <svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <span class="btn-text">{{ selectedAvatarLabel }}</span>
          </div>
        </button>
        <div class="dropdown-menu">
          <h4>Avatar</h4>
          <div
            v-for="avatar in avatarOptions"
            :key="avatar.label"
            class="device"
            :class="{ active: selectedAvatar === avatar.file }"
            @click="selectAvatarOption(avatar.file)"
          >
            <div>
              <div>{{ avatar.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <select
        v-if="isFilesystemOutput"
        class="btn fs-recordings-select"
        style="margin-left: 12px;"
        :disabled="running"
        :value="fsSelectedRecording?.path ?? ''"
        @change="onRecordingSelectChange"
      >
        <option value="">No Recordings</option>
        <option v-for="recording in fsRecordings" :key="recording.path" :value="recording.path">{{ recording.name }}</option>
      </select>

      <button
        v-if="isFilesystemOutput && fsSelectedRecording"
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

    <div class="nav-right">
      <div class="menu-right">
        <button class="btn btn-icon" @click="toggleSettings" aria-label="Settings" :disabled="running">
          <img src="/assets/settings.svg" alt="">
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { deviceShortCode } from './sidebar/useCameraFeedUtils';
import { useCameraStore } from '../stores/useCameraStore';
import { useFilesystemStore } from '../stores/useFilesystemStore';
import { useIrisStore } from '../stores/useIrisStore';
import { useUIStore } from '../stores/useUIStore';

const appTitle = (import.meta.env.VITE_APP_TITLE as string) || 'Example App';

const {
  devices,
  selectedDeviceIds,
  selectedDevices,
  enumerateCameras,
  selectDevice,
} = useCameraStore();

const {
  avatarOptions,
  outputOption,
  outputOptions,
  personCount,
  personCountOptions,
  running,
  selectedAvatar,
  selectAvatar,
  selectOutput,
  selectPersonCount,
  selectTracking,
  trackingOptions,
  trackingType,
} = useIrisStore();

const {
  dropdowns,
  anyDropdownOpen,
  closeAllDropdowns,
  setDropdown,
  toggleDropdown,
  showSettings,
  setShowSettings,
} = useUIStore();

const {
  fsRecordings,
  fsSelectedRecording,
  isFilesystemOutput,
  onRecordingSelectChange,
  openRenameModal,
} = useFilesystemStore();

const logoError = ref(false);
const splitRef = ref<HTMLElement | null>(null);
const cameraButtonRef = ref<HTMLButtonElement | null>(null);
const cameraListRef = ref<HTMLElement | null>(null);
const cameraActiveIndex = ref(0);

const activeCameraOptionId = computed(() => (
  devices.value.length > 0 ? `cam-opt-${cameraActiveIndex.value}` : undefined
));

const selectedAvatarLabel = computed(() => (
  selectedAvatar.value
    ? avatarOptions.find((avatar) => avatar.file === selectedAvatar.value)?.label ?? 'Avatar'
    : 'Avatar'
));

function setInitialCameraActiveIndex(mode: 'first' | 'last' | 'current-or-first') {
  if (devices.value.length === 0) {
    cameraActiveIndex.value = 0;
    return;
  }

  if (mode === 'last') {
    cameraActiveIndex.value = devices.value.length - 1;
    return;
  }

  if (mode === 'current-or-first') {
    const index = selectedDeviceIds.value
      ? devices.value.findIndex((device) => selectedDeviceIds.value?.includes(device.deviceId))
      : -1;
    cameraActiveIndex.value = index >= 0 ? index : 0;
    return;
  }

  cameraActiveIndex.value = 0;
}

function focusCameraListSoon() {
  void nextTick(() => cameraListRef.value?.focus());
}

function scrollActiveIntoView() {
  void nextTick(() => {
    document.getElementById(`cam-opt-${cameraActiveIndex.value}`)?.scrollIntoView({ block: 'nearest' });
  });
}

function toggleCamera() {
  const willOpen = toggleDropdown('camera');
  if (willOpen) {
    void enumerateCameras();
    setInitialCameraActiveIndex('current-or-first');
    focusCameraListSoon();
  }
}

function togglePersonCount() {
  toggleDropdown('personCount');
}

function toggleTrack() {
  toggleDropdown('track');
}

function toggleOutput() {
  toggleDropdown('output');
}

function toggleAvatar() {
  toggleDropdown('avatar');
}

function onCameraButtonKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!dropdowns.camera) {
      setDropdown('camera', true);
      setInitialCameraActiveIndex(event.key === 'ArrowDown' ? 'first' : 'last');
      void enumerateCameras();
      event.preventDefault();
      focusCameraListSoon();
    }
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    const willOpen = !dropdowns.camera;
    setDropdown('camera', willOpen);
    if (willOpen) {
      setInitialCameraActiveIndex('current-or-first');
      void enumerateCameras();
      focusCameraListSoon();
    }
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    setDropdown('camera', false);
    event.preventDefault();
  }
}

function onCameraListKeydown(event: KeyboardEvent) {
  if (devices.value.length === 0) {
    if (event.key === 'Escape') {
      setDropdown('camera', false);
      cameraButtonRef.value?.focus();
      event.preventDefault();
    }
    return;
  }

  const max = devices.value.length - 1;
  if (event.key === 'ArrowDown') {
    cameraActiveIndex.value = Math.min(max, cameraActiveIndex.value + 1);
    event.preventDefault();
    scrollActiveIntoView();
  } else if (event.key === 'ArrowUp') {
    cameraActiveIndex.value = Math.max(0, cameraActiveIndex.value - 1);
    event.preventDefault();
    scrollActiveIntoView();
  } else if (event.key === 'Home') {
    cameraActiveIndex.value = 0;
    event.preventDefault();
    scrollActiveIntoView();
  } else if (event.key === 'End') {
    cameraActiveIndex.value = max;
    event.preventDefault();
    scrollActiveIntoView();
  } else if (event.key === 'Enter') {
    const device = devices.value[cameraActiveIndex.value];
    if (device) {
      void selectDevice(device, cameraActiveIndex.value);
    }
    event.preventDefault();
  } else if (event.key === 'Escape') {
    setDropdown('camera', false);
    cameraButtonRef.value?.focus();
    event.preventDefault();
  }
}

function selectTrackingOption(value: string) {
  selectTracking(value);
  setDropdown('track', false);
}

function selectPersonCountOption(value: string) {
  selectPersonCount(value);
  setDropdown('personCount', false);
}

function selectOutputOption(value: string) {
  selectOutput(value);
  setDropdown('output', false);
}

function selectAvatarOption(file: string | null) {
  selectAvatar(file);
  setDropdown('avatar', false);
}

function toggleSettings() {
  setShowSettings(!showSettings.value);
}

function onClickOutside(event: MouseEvent) {
  if (!anyDropdownOpen.value) return;
  const dropdown = (event.target as HTMLElement | null)?.closest('.dropdown');
  if (!dropdown) {
    closeAllDropdowns();
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  requestAnimationFrame(() => {
    splitRef.value?.classList.add('ready');
  });
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
});
</script>
