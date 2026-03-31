<template>
  <div class="sidenav">
    <!-- Filesystem playback mode: video files are loaded -->
    <PlaybackPanel
      v-if="isPlaybackMode"
      :video-urls="props.playbackVideoUrls ?? []"
      :is-playing="props.isPlayingBack ?? false"
      :feed-names="playbackFeedNames"
    />

    <!-- Live camera mode: real webcams selected -->
    <CameraLivePanel
      v-else-if="props.selectedCameras && props.selectedCameras.length > 0"
      :selected-cameras="props.selectedCameras"
      :selected-camera-ids="props.selectedCameraIds"
      :scene-cameras="props.sceneCameras"
      :camera-rotation="props.cameraRotation"
      :devices="props.devices"
      :person-count="props.personCount"
      @iris-data-update="emit('irisDataUpdate', $event)"
      @reorder-cameras="emit('reorderCameras', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SceneCameraEntry } from '../lib/useSceneCameras';
import CameraLivePanel from './sidebar/panels/CameraLivePanel.vue';
import PlaybackPanel from './sidebar/panels/PlaybackPanel.vue';

// ── Props — identical public API as before ───────────────────────────────────
interface Props {
  personCount: string | null;
  irisData: IrisData[] | IrisData | null;
  selectedCameras: MediaDeviceInfo[] | null;
  selectedCameraIds: string[] | null;
  sceneCameras: SceneCameraEntry[];
  cameraRotation: Record<string, number>;
  devices: MediaDeviceInfo[];
  playbackVideoUrls?: (string | null)[];
  isPlayingBack?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  irisDataUpdate: [IrisData[] | IrisData | null];
  reorderCameras: [MediaDeviceInfo[]];
}>();

// ── Panel routing ────────────────────────────────────────────────────────────
/** True when we have resolved video file URLs to play back. */
const isPlaybackMode = computed(() =>
  (props.playbackVideoUrls?.length ?? 0) > 0 &&
  props.playbackVideoUrls!.some(u => u !== null)
);

/** Feed display names derived from the URL filenames. */
const playbackFeedNames = computed(() =>
  (props.playbackVideoUrls ?? []).map(url => {
    if (!url) return '';
    try { return decodeURIComponent(url.split('/').pop() ?? ''); } catch { return ''; }
  })
);
</script>

<style scoped>
.sidenav {
  position: absolute;
  right: 0;
  height: calc(100% - 63px);
  width: 250px;
  background-color: var(--sidebar);
  z-index: 10;
  border-left: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

@media (max-width: 768px) {
  .sidenav { display: none; }
}
</style>
