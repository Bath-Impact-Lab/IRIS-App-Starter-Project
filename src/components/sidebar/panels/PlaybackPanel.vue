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
            style="width: 100%;"
            :id="`cameraFeed${i}`"
            playsinline
            muted
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

async function openModal(i: number) {
  const url = props.videoUrls[i];
  if (!url) return;
  modalIndex.value = i;
  await nextTick();
  if (!modalVideoRef.value) return;
  // Mirror the current playback position from the sidebar video
  const sidebarVideo = videoRefs.value[i];
  modalVideoRef.value.src = url;
  modalVideoRef.value.load();
  modalVideoRef.value.addEventListener('loadeddata', () => {
    if (sidebarVideo) modalVideoRef.value!.currentTime = sidebarVideo.currentTime;
    if (props.isPlaying) modalVideoRef.value!.play().catch(() => {});
  }, { once: true });
}

function closeModal() {
  if (modalVideoRef.value) {
    modalVideoRef.value.pause();
    modalVideoRef.value.src = '';
  }
  modalIndex.value = null;
}

// Keep modal video in sync with play/pause state
watch(() => props.isPlaying, (playing) => {
  if (modalIndex.value === null || !modalVideoRef.value) return;
  if (playing) {
    modalVideoRef.value.play().catch(() => {});
  } else {
    modalVideoRef.value.pause();
  }
});

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
