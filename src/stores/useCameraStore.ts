import { computed, nextTick, ref } from 'vue';
import { useCameras } from '../lib/useCameras';
import { useIrisStore } from './useIrisStore';

export interface RecordingVideoFile {
  index: number;
  name: string;
  path: string;
}

const cameraRotation = ref<Record<string, number>>({});
const fsVideoFiles = ref<RecordingVideoFile[]>([]);
const fsPlaybackVideoUrls = ref<(string | null)[]>([]);

const cameraService = useCameras({ autoReselect: true });

const {
  devices,
  selectedDeviceId,
  selectedDevices,
  enumerateCameras,
  selectDevice: toggleSelectedDevice,
  init: initCameras,
  dispose: disposeCameras,
} = cameraService;

const { outputOption } = useIrisStore();

const selectedCameraCount = computed(() => selectedDevices.value?.length ?? 0);
const hasSelectedCameras = computed(() => !!selectedDevices.value && selectedDevices.value.length > 0);
const hasCameraSelected = computed(() => (
  hasSelectedCameras.value ||
  (outputOption.value === 'Filesystem' && fsVideoFiles.value.length > 0)
));

function isPlaybackDevice(device: MediaDeviceInfo) {
  return device.deviceId.startsWith('fs-playback-');
}

function ensureCameraRotation(deviceId: string) {
  if (cameraRotation.value[deviceId] === undefined) {
    cameraRotation.value[deviceId] = 0;
  }
}

async function startCameraStream(camera: MediaDeviceInfo, index: number) {
  if (isPlaybackDevice(camera)) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: camera.deviceId },
        frameRate: 30,
      },
    });

    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement | null;
    if (video) video.srcObject = stream;
  } catch (err) {
    console.error('Camera access failed:', err);
  }
}

function stopCameraStream(index: number) {
  try {
    console.log(`Stopping camera stream at index ${index}`);
    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      track.stop();
    });

    video.srcObject = null;
  } catch {
    console.log('Cameras are gone');
  }
}

async function refreshStreams() {
  await nextTick();

  selectedDevices.value?.forEach((device, index) => {
    if (!isPlaybackDevice(device)) {
      void startCameraStream(device, index);
    }
  });
}

async function selectDevice(device: MediaDeviceInfo, index: number) {
  const wasSelected = selectedDevices.value?.some((item) => item.deviceId === device.deviceId) ?? false;

  toggleSelectedDevice(device);

  const isSelected = selectedDevices.value?.some((item) => item.deviceId === device.deviceId) ?? false;

  if (isSelected) {
    ensureCameraRotation(device.deviceId);
  } else if (wasSelected) {
    stopCameraStream(index);
  }

  await refreshStreams();
}

async function reorderCameras(newOrder: MediaDeviceInfo[]) {
  selectedDevices.value = [...newOrder];
  selectedDeviceId.value = newOrder.map((device) => device.deviceId);
  await refreshStreams();
}

function setPlaybackVideoFiles(files: RecordingVideoFile[]) {
  fsVideoFiles.value = files;
}

function setPlaybackVideoUrls(urls: (string | null)[]) {
  fsPlaybackVideoUrls.value = urls;
}

function attachPlaybackDevices(files: RecordingVideoFile[]) {
  fsVideoFiles.value = files;

  if (!selectedDevices.value || selectedDevices.value.length === 0) {
    selectedDevices.value = files.map((file) => ({
      deviceId: `fs-playback-${file.index}`,
      groupId: '',
      kind: 'videoinput' as MediaDeviceKind,
      label: file.name,
      toJSON: () => ({}),
    } as MediaDeviceInfo));
    selectedDeviceId.value = selectedDevices.value.map((device) => device.deviceId);
  }
}

function clearPlaybackDevices() {
  fsVideoFiles.value = [];
  fsPlaybackVideoUrls.value = [];

  if (selectedDevices.value?.every((device) => isPlaybackDevice(device))) {
    selectedDevices.value = null;
    selectedDeviceId.value = null;
  }
}

export function useCameraStore() {
  return {
    devices,
    selectedDeviceIds: selectedDeviceId,
    selectedDevices,
    cameraRotation,
    fsVideoFiles,
    fsPlaybackVideoUrls,
    selectedCameraCount,
    hasSelectedCameras,
    hasCameraSelected,
    enumerateCameras,
    init: initCameras,
    dispose: disposeCameras,
    selectDevice,
    reorderCameras,
    startCameraStream,
    stopCameraStream,
    refreshStreams,
    setPlaybackVideoFiles,
    setPlaybackVideoUrls,
    attachPlaybackDevices,
    clearPlaybackDevices,
    ensureCameraRotation,
  } as const;
}
