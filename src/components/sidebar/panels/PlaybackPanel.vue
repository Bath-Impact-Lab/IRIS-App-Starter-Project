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
          <button class="expand-btn" @click="openModal(i)" title="Expand">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        </div>

        <div :id="`camera-box${i}`">
          <video
            ref="videoRefs"
            style="width: 100%; cursor: pointer;"
            :id="`cameraFeed${i}`"
            playsinline
            muted
            @click="openModal(i)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Modal teleported to body so it overlays the ThreeJS viewer -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modalIndex !== null" class="video-modal-overlay" @click.self="closeModal">
        <div class="video-modal">
          <div class="video-modal-header">
            <span class="video-modal-title">{{ modalIndex !== null ? feedLabel(modalIndex) : '' }}</span>
            <div class="video-modal-meta" v-if="modalMeta.resolution">
              <span class="meta-pill" v-if="props.isPlaying || modalMeta.fps !== null">{{ modalMeta.fps !== null ? `${modalMeta.fps} fps` : '… fps' }}</span>
              <span class="meta-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;margin-top:-1px">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>{{ modalMeta.resolution }}px
              </span>
              <span class="meta-pill" v-if="modalMeta.duration !== null">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;margin-top:-1px">
                  <circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 15.5"/><path d="M9 3h6"/><line x1="12" y1="3" x2="12" y2="5"/>
                </svg>{{ modalMeta.duration }}
              </span>
            </div>
            <button class="video-modal-close" @click="closeModal" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="video-modal-body">
            <video
              ref="modalVideoRef"
              class="video-modal-player"
              playsinline
              muted
              controls
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

// ── Modal state ──────────────────────────────────────────────────────────────
const modalIndex = ref<number | null>(null);
const modalVideoRef = ref<HTMLVideoElement | null>(null);

interface ModalMeta {
  fps: number | null;
  resolution: string | null;
  duration: string | null;
}
const modalMeta = ref<ModalMeta>({ fps: null, resolution: null, duration: null });

let fpsFrameCount = 0;
let fpsWindowStart = 0;
let fpsRafHandle = 0;

function startFpsMeasurement(video: HTMLVideoElement) {
  stopFpsMeasurement();
  fpsFrameCount = 0;
  fpsWindowStart = 0;

  function onFrame(_now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) {
    if (fpsWindowStart === 0) {
      // First frame — just record timestamp, request next
      fpsWindowStart = meta.expectedDisplayTime;
      fpsFrameCount = 0;
    } else {
      fpsFrameCount++;
      const elapsed = meta.expectedDisplayTime - fpsWindowStart;
      if (elapsed >= 500 && fpsFrameCount >= 2) {
        // Enough data — derive FPS from frame interval average
        const avgInterval = elapsed / fpsFrameCount;
        modalMeta.value.fps = Math.round(1000 / avgInterval);
        // Stop — we have a stable reading; restart only on seek/resume
        fpsRafHandle = 0;
        return;
      }
    }
    if (modalIndex.value !== null && !video.paused && !video.ended) {
      fpsRafHandle = video.requestVideoFrameCallback(onFrame);
    }
  }
  fpsRafHandle = video.requestVideoFrameCallback(onFrame);
}

function stopFpsMeasurement() {
  if (fpsRafHandle && modalVideoRef.value) {
    modalVideoRef.value.cancelVideoFrameCallback(fpsRafHandle);
  }
  fpsRafHandle = 0;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

async function openModal(i: number) {
  const url = props.videoUrls[i];
  if (!url) return;
  modalIndex.value = i;
  modalMeta.value = { fps: null, resolution: null, duration: null };
  await nextTick();
  if (!modalVideoRef.value) return;
  const sidebarVideo = videoRefs.value[i];
  const video = modalVideoRef.value;
  video.src = url;
  video.load();
  video.addEventListener('loadedmetadata', () => {
    modalMeta.value.resolution = `${video.videoWidth}×${video.videoHeight}`;
    if (isFinite(video.duration)) {
      modalMeta.value.duration = formatDuration(video.duration);
    }
  }, { once: true });
  video.addEventListener('loadeddata', () => {
    if (sidebarVideo) video.currentTime = sidebarVideo.currentTime;
    if (props.isPlaying) {
      video.play().catch(() => {});
      startFpsMeasurement(video);
    }
  }, { once: true });
  // Restart measurement on every play (covers opens, re-seeks, play-after-pause)
  video.addEventListener('playing', () => {
    modalMeta.value.fps = null;
    startFpsMeasurement(video);
  });
}

// Restart FPS measurement when video resumes
watch(() => props.isPlaying, (playing) => {
  if (modalIndex.value === null || !modalVideoRef.value) return;
  if (playing) {
    modalVideoRef.value.play().catch(() => {});
    modalMeta.value.fps = null;
    startFpsMeasurement(modalVideoRef.value);
  } else {
    modalVideoRef.value.pause();
    stopFpsMeasurement();
  }
});

function closeModal() {
  stopFpsMeasurement();
  if (modalVideoRef.value) {
    modalVideoRef.value.pause();
    modalVideoRef.value.src = '';
  }
  modalMeta.value = { fps: null, resolution: null, duration: null };
  modalIndex.value = null;
}

// ── Sidebar video management ─────────────────────────────────────────────────
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

onMounted(async () => {
  await nextTick();
  loadAll();
  if (props.isPlaying) playAll();
});

watch(() => props.videoUrls, async () => {
  await nextTick();
  loadAll();
  if (props.isPlaying) playAll();
}, { deep: true });

watch(() => props.isPlaying, (playing) => {
  if (playing) { playAll(); } else { pauseAll(); }
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
  justify-content: space-between;
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

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: rgba(255,255,255,0.35);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.expand-btn:hover {
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.25);
}

/* Modal */
.video-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.video-modal {
  background: rgba(14,20,28,0.97);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  width: min(900px, calc(100vw - 300px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6);
}

.video-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}

.video-modal-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 200px;
}

.video-modal-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}

.meta-pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.45);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.video-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.video-modal-close:hover {
  color: #fff;
  background: rgba(255,255,255,0.1);
}

.video-modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.video-modal-player {
  width: 100%;
  height: 100%;
  max-height: calc(100vh - 130px);
  object-fit: contain;
  display: block;
}

/* Transition */
.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
