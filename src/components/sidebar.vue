<template>
  <div class="sidenav" :style="{width: sidebarWidth + 'px'}">
    <div class="resizer" @mousedown="startResize"></div>
    <!-- Filesystem playback mode: video files are loaded -->
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
);

const sidebarWidth = ref(250)
const isResizing = ref(false)

const onMouseMove = (e: MouseEvent) => {
  if (!isResizing.value) return

  let newWidth = e.clientX
  
  sidebarWidth.value = window.innerWidth - newWidth
}

const stopResize = () => {
  isResizing.value = false
  document.body.style.cursor = "default"
}

const startResize = () => {
  isResizing.value = true
  document.body.style.cursor = "ew-resize"
}

onMounted(() => {
  document.addEventListener("mousemove", onMouseMove)
  document.addEventListener("mouseup", stopResize)
})

onUnmounted(() => {
  document.removeEventListener("mousedown", onMouseMove)
  document.removeEventListener("mouseup", stopResize)
})

</script>

<style scoped>
.sidenav {
  position: absolute;
  right: 0;
  height: calc(100% - 63px);
  min-width: 250px;
  max-width: 1000px;
  background-color: var(--sidebar);
  z-index: 10;
  border-left: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.resizer {
  width: 5px;
  cursor: ew-resize;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
}

@media (max-width: 768px) {
  .sidenav { display: none; }
}
</style>
