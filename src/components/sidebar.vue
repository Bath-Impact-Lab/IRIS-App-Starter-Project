<template>
  <div class="sidenav">
    <PlaybackPanel
      v-if="isPlaybackMode"
      :video-urls="fsPlaybackVideoUrls"
      :is-playing="isPlaying"
      :feed-names="playbackFeedNames"
    />

    <CameraLivePanel v-else-if="selectedDevices && selectedDevices.length > 0" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CameraLivePanel from './sidebar/panels/CameraLivePanel.vue';
import PlaybackPanel from './sidebar/panels/PlaybackPanel.vue';
import { useCameraStore } from '../stores/useCameraStore';
import { useFilesystemStore } from '../stores/useFilesystemStore';

const { selectedDevices, fsPlaybackVideoUrls } = useCameraStore();
const { isPlaying } = useFilesystemStore();

const isPlaybackMode = computed(() => (
  fsPlaybackVideoUrls.value.length > 0 &&
  fsPlaybackVideoUrls.value.some((url) => url !== null)
));

const playbackFeedNames = computed(() => (
  fsPlaybackVideoUrls.value.map((url) => {
    if (!url) return '';
    try {
      return decodeURIComponent(url.split('/').pop() ?? '');
    } catch {
      return '';
    }
  })
));
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
