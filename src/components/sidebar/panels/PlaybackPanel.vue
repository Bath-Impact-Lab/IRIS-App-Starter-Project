<template>
  <div class="panel-root">
    <div class="cameras">
      <div
        v-for="(_url, i) in props.videoUrls"
        :key="i"
        class="camera-list"
      >
        <div class="camera-text">
          <span class="feed-label">{{ feedLabel(i) }}</span>
        </div>

        <div :id="`camera-box${i}`">
          <video
            ref="videoRefs"
            style="width: 100%;"
            :id="`cameraFeed${i}`"
            playsinline
            muted
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';

interface Props {
  /** Resolved file:// URLs for each video track, indexed by camera slot. */
  videoUrls: (string | null)[];
  /** Drives play / pause on all video elements. */
  isPlaying: boolean;
  /** Display names for each feed (e.g. filename). Falls back to "Feed N". */
  feedNames?: string[];
}

const props = defineProps<Props>();

// v-for ref — Vue populates this array with each <video> element in order
const videoRefs = ref<HTMLVideoElement[]>([]);

function loadAll() {
  videoRefs.value.forEach((video, i) => {
    const url = props.videoUrls[i];
    if (!url) return;
    // Always set src and reload — let the browser deduplicate
    video.src = url;
    video.load();
  });
}

function playAll() {
  videoRefs.value.forEach((video, i) => {
    if (!props.videoUrls[i]) return;
    video.play().catch(() => {});
  });
}

function pauseAll() {
  videoRefs.value.forEach(video => {
    if (!video.paused) video.pause();
  });
}

// Load videos once the component has mounted and refs are populated
onMounted(async () => {
  await nextTick();
  loadAll();
  if (props.isPlaying) playAll();
});

// When URLs change (new recording selected), reload all
watch(() => props.videoUrls, async () => {
  await nextTick();
  loadAll();
  if (props.isPlaying) playAll();
}, { deep: true });

// Play / pause when the parent toggles isPlaying
watch(() => props.isPlaying, (playing) => {
  if (playing) {
    playAll();
  } else {
    pauseAll();
  }
});


// ── Helpers ──────────────────────────────────────────────────────────────────
function feedLabel(index: number): string {
  return props.feedNames?.[index] ?? `Feed ${index + 1}`;
}
</script>

<style scoped>
.panel-root {
  display: contents;
}

.cameras {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  overflow-x: hidden;
}

.camera-list {
  padding: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  margin: 5px 0;
}

.camera-text {
  display: flex;
  align-items: center;
  padding-bottom: 5px;
  font-size: 13px;
}

.feed-label {
  color: rgba(255,255,255,0.45);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
