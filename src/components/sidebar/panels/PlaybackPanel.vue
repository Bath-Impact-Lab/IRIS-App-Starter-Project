<template>
  <div class="panel-root">
    <div class="cameras">
      <div
        v-for="(url, i) in props.videoUrls"
        :key="i"
        class="camera-list"
      >
        <div class="camera-text">
          <span class="feed-label">{{ feedLabel(i) }}</span>
        </div>

        <div :id="`camera-box${i}`">
          <video
            style="width: 100%;"
            :id="`cameraFeed${i}`"
            playsinline
            muted
            :src="url ?? undefined"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, nextTick } from 'vue';

interface Props {
  /** Resolved file:// URLs for each video track, indexed by camera slot. */
  videoUrls: (string | null)[];
  /** Drives play / pause on all video elements. */
  isPlaying: boolean;
  /** Display names for each feed (e.g. filename). Falls back to "Feed N". */
  feedNames?: string[];
}

const props = defineProps<Props>();

// ── Play / pause on isPlaying change ────────────────────────────────────────
watch(() => props.isPlaying, async (playing) => {
  await nextTick();
  props.videoUrls.forEach((url, i) => {
    if (!url) return;
    const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement | null;
    if (!video) return;
    if (playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
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

