import { computed, ref, watch } from 'vue';
import { useCameraStore, type RecordingVideoFile } from './useCameraStore';
import { useIrisStore } from './useIrisStore';
import { useUIStore } from './useUIStore';

export interface RecordingEntry {
  name: string;
  path: string;
}

const fsRecordingsDir = ref<string | null>(null);
const fsRecordings = ref<RecordingEntry[]>([]);
const fsSelectedRecording = ref<RecordingEntry | null>(null);

const isRecording = ref(false);
const isPlaying = ref(false);
const fsPositions = ref<IrisData[]>([]);
const fsFrameIndex = ref(0);
const fsPlaybackSeconds = ref(0);
const fsDuration = ref(0);
const timelineHoverX = ref<number | null>(null);

const renameValue = ref('');
const renameError = ref('');

let fsPlaybackTimer: ReturnType<typeof setInterval> | null = null;
let fsRecordTimer: ReturnType<typeof setInterval> | null = null;

const cameraStore = useCameraStore();
const irisStore = useIrisStore();
const uiStore = useUIStore();

const isFilesystemOutput = computed(() => irisStore.outputOption.value === 'Filesystem');
const playbackDisabled = computed(() => (
  isRecording.value || !fsSelectedRecording.value || fsPositions.value.length === 0
));

const timelinePercent = computed(() => {
  if (fsPositions.value.length <= 1) return 0;
  return Math.min(100, (fsFrameIndex.value / (fsPositions.value.length - 1)) * 100);
});

const fsTimeDisplay = computed(() => {
  const minutes = Math.floor(fsPlaybackSeconds.value / 60).toString().padStart(2, '0');
  const seconds = (fsPlaybackSeconds.value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
});

async function refreshRecordings() {
  if (!fsRecordingsDir.value) return;
  if (!window.ipc?.fsListRecordings) return;

  fsRecordings.value = await window.ipc.fsListRecordings(fsRecordingsDir.value);
}

function selectRecordingByPath(path: string) {
  fsSelectedRecording.value = path
    ? (fsRecordings.value.find((recording) => recording.path === path) ?? null)
    : null;
}

function onRecordingSelectChange(event: Event) {
  selectRecordingByPath((event.target as HTMLSelectElement).value);
}

function openRenameModal() {
  renameValue.value = fsSelectedRecording.value?.name ?? '';
  renameError.value = '';
  uiStore.setShowRenameModal(true);
}

function closeRenameModal() {
  uiStore.setShowRenameModal(false);
  renameError.value = '';
}

async function submitRename() {
  const trimmed = renameValue.value.trim();
  if (!trimmed || !fsSelectedRecording.value) return;
  if (trimmed === fsSelectedRecording.value.name) {
    closeRenameModal();
    return;
  }
  if (!window.ipc?.fsRenameRecording) return;

  const result = await window.ipc.fsRenameRecording(fsSelectedRecording.value.path, trimmed);
  if (!result.ok) {
    renameError.value = result.error ?? 'Unable to rename recording.';
    return;
  }

  fsSelectedRecording.value = { name: trimmed, path: result.newPath ?? fsSelectedRecording.value.path };
  await refreshRecordings();
  fsSelectedRecording.value = fsRecordings.value.find((recording) => recording.path === result.newPath) ?? null;
  closeRenameModal();
}

function syncPlaybackVideos() {
  cameraStore.fsPlaybackVideoUrls.value.forEach((url, index) => {
    if (!url) return;

    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement | null;
    if (video) video.currentTime = fsPlaybackSeconds.value;
  });
}

function setPlaybackFrame(frame: number) {
  fsFrameIndex.value = frame;
  fsPlaybackSeconds.value = Math.floor(frame / 30);

  if (fsPositions.value[frame]) {
    irisStore.setIrisData(fsPositions.value[frame]);
  }

  syncPlaybackVideos();
}

function stopFsTimer() {
  if (fsPlaybackTimer) {
    clearInterval(fsPlaybackTimer);
    fsPlaybackTimer = null;
  }
}

function toggleRecording() {
  if (isRecording.value) {
    isRecording.value = false;
    if (fsRecordTimer) {
      clearInterval(fsRecordTimer);
      fsRecordTimer = null;
    }
    void window.ipc?.stopMonitor?.();
    return;
  }

  isPlaying.value = false;
  stopFsTimer();
  fsPlaybackSeconds.value = 0;
  fsDuration.value = 0;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const recordingName = `recording-${timestamp}`;
  const outputDir = fsRecordingsDir.value
    ? `${fsRecordingsDir.value}\\${recordingName}`
    : recordingName;

  isRecording.value = true;
  fsRecordTimer = setInterval(() => {
    fsDuration.value += 1;
  }, 1000);

  void window.ipc?.startMonitor?.(outputDir);
}

function togglePlayback() {
  if (isPlaying.value) {
    isPlaying.value = false;
    stopFsTimer();
    return;
  }

  if (fsPositions.value.length === 0) return;

  if (fsFrameIndex.value >= fsPositions.value.length - 1) {
    fsFrameIndex.value = 0;
    fsPlaybackSeconds.value = 0;
  }

  isPlaying.value = true;
  fsPlaybackTimer = setInterval(() => {
    if (fsFrameIndex.value >= fsPositions.value.length - 1) {
      isPlaying.value = false;
      stopFsTimer();
      return;
    }

    setPlaybackFrame(fsFrameIndex.value + 1);
  }, 1000 / 30);
}

function skipBackward() {
  setPlaybackFrame(Math.max(0, fsFrameIndex.value - 10 * 30));
}

function skipForward() {
  setPlaybackFrame(Math.min(fsPositions.value.length - 1, fsFrameIndex.value + 10 * 30));
}

function scrubTimeline(event: MouseEvent) {
  if (playbackDisabled.value || fsPositions.value.length === 0) return;

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  setPlaybackFrame(Math.round(pct * (fsPositions.value.length - 1)));
}

function onTimelineHover(event: MouseEvent) {
  if (fsPositions.value.length === 0) return;

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  timelineHoverX.value = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
}

watch(irisStore.outputOption, async (value, oldValue) => {
  if (value === 'Filesystem' && !fsRecordingsDir.value && window.ipc?.fsGetDefaultRecordingsDir) {
    fsRecordingsDir.value = await window.ipc.fsGetDefaultRecordingsDir();
    await refreshRecordings();
  }

  if (oldValue === 'Filesystem' && value !== 'Filesystem') {
    isPlaying.value = false;
    stopFsTimer();
    fsPositions.value = [];
    fsFrameIndex.value = 0;
    fsPlaybackSeconds.value = 0;
    fsDuration.value = 0;
    fsSelectedRecording.value = null;
    cameraStore.clearPlaybackDevices();
  }
});

watch(isRecording, async (value) => {
  if (!value) {
    await refreshRecordings();
  }
});

watch(fsSelectedRecording, async (recording) => {
  isPlaying.value = false;
  stopFsTimer();
  fsFrameIndex.value = 0;
  fsPlaybackSeconds.value = 0;
  fsPositions.value = [];
  fsDuration.value = 0;
  cameraStore.setPlaybackVideoFiles([]);
  cameraStore.setPlaybackVideoUrls([]);

  if (!recording) {
    cameraStore.clearPlaybackDevices();
    return;
  }

  if (!window.ipc?.fsGetRecordingData) return;

  const data = await window.ipc.fsGetRecordingData(recording.path);

  if (Array.isArray(data?.positions) && data.positions.length > 0) {
    fsPositions.value = data.positions;
    fsDuration.value = Math.floor(data.positions.length / 30);
  }

  if (Array.isArray(data?.videoFiles) && data.videoFiles.length > 0) {
    const files = data.videoFiles as RecordingVideoFile[];
    cameraStore.attachPlaybackDevices(files);

    const urls: (string | null)[] = new Array(files.length).fill(null);
    await Promise.all(files.map(async (file) => {
      urls[file.index] = await window.ipc!.fsGetVideoUrl(file.path);
    }));
    cameraStore.setPlaybackVideoUrls(urls);
  }
});

function dispose() {
  stopFsTimer();
  if (fsRecordTimer) {
    clearInterval(fsRecordTimer);
    fsRecordTimer = null;
  }
}

export function useFilesystemStore() {
  return {
    fsRecordingsDir,
    fsRecordings,
    fsSelectedRecording,
    isFilesystemOutput,
    isRecording,
    isPlaying,
    playbackDisabled,
    fsPlaybackSeconds,
    fsDuration,
    timelineHoverX,
    timelinePercent,
    fsTimeDisplay,
    renameValue,
    renameError,
    refreshRecordings,
    onRecordingSelectChange,
    openRenameModal,
    closeRenameModal,
    submitRename,
    toggleRecording,
    togglePlayback,
    skipBackward,
    skipForward,
    scrubTimeline,
    onTimelineHover,
    dispose,
  } as const;
}
