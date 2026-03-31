<template>
  <div class="hud hud-scene-controls">
    <button
      class="hud-icon-btn"
      :class="{ active: showPlaySpace }"
      @click="emit('toggle-play-space')"
      title="Toggle Playspace"
      aria-label="Toggle Playspace"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="15" x2="21" y2="15"/>
        <line x1="9" y1="3" x2="9" y2="21"/>
        <line x1="15" y1="3" x2="15" y2="21"/>
      </svg>
    </button>
    <button
      class="hud-icon-btn"
      :class="{ active: showCameras }"
      @click="emit('toggle-cameras')"
      title="Toggle Cameras"
      aria-label="Toggle Cameras"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  showPlaySpace: boolean;
  showCameras: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'toggle-play-space': [];
  'toggle-cameras': [];
}>();
</script>

<style scoped>
.hud-scene-controls {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 4;
}

@media (max-width: 768px) {
  .hud-scene-controls {
    bottom: 12px;
  }
}
</style>
