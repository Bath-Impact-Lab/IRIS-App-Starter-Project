import { computed, reactive, ref } from 'vue';

export type DropdownKey = 'camera' | 'personCount' | 'track' | 'output' | 'avatar';

const dropdowns = reactive<Record<DropdownKey, boolean>>({
  camera: false,
  personCount: false,
  track: false,
  output: false,
  avatar: false,
});

const showPlaySpace = ref(true);
const showCameras = ref(true);
const showSettings = ref(false);
const showRenameModal = ref(false);
const showIrisNotFound = ref(false);

const anyDropdownOpen = computed(() => Object.values(dropdowns).some(Boolean));

function closeAllDropdowns() {
  (Object.keys(dropdowns) as DropdownKey[]).forEach((key) => {
    dropdowns[key] = false;
  });
}

function setDropdown(name: DropdownKey, value: boolean) {
  if (value) closeAllDropdowns();
  dropdowns[name] = value;
}

function toggleDropdown(name: DropdownKey) {
  const willOpen = !dropdowns[name];
  setDropdown(name, willOpen);
  return willOpen;
}

function setShowSettings(value: boolean) {
  showSettings.value = value;
}

function setShowRenameModal(value: boolean) {
  showRenameModal.value = value;
}

function setShowIrisNotFound(value: boolean) {
  showIrisNotFound.value = value;
}

export function useUIStore() {
  return {
    dropdowns,
    anyDropdownOpen,
    showPlaySpace,
    showCameras,
    showSettings,
    showRenameModal,
    showIrisNotFound,
    closeAllDropdowns,
    setDropdown,
    toggleDropdown,
    setShowSettings,
    setShowRenameModal,
    setShowIrisNotFound,
  } as const;
}
