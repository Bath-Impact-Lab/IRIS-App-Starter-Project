<template>
  <div v-if="running" class="hud hud-center">
    <span class="activity-blinker"></span>
    <span class="hud-item">IRIS Engine</span>
    <div class="hud-sep"></div>
    <span class="hud-item fps-counter">{{ fps }} <span class="fps-unit">FPS</span></span>
  </div>

  <div v-if="isValidLicense" class="hud hud-right">
    <div
      class="license-badge-container"
      :class="{ clickable: planType === 'Trial' }"
      @click="onLicenseClick"
    >
      <div class="badge glass">
        <span class="badge-dot" :class="planType?.toLowerCase()"></span>
        <span class="badge-text">{{ planType || 'Trial' }} License</span>
      </div>
    </div>
  </div>

  <div v-if="jointAnglesPretty" class="debug" aria-live="polite">
    <div class="debug-title">Joint Angles</div>
    <pre class="debug-pre">{{ jointAnglesPretty }}</pre>
  </div>
</template>

<script setup lang="ts">
interface Props {
  running: boolean;
  fps: number;
  isValidLicense: boolean;
  planType: string | null;
  jointAnglesPretty: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'open-settings': [];
}>();

function onLicenseClick() {
  if (props.planType === 'Trial') {
    emit('open-settings');
  }
}
</script>
