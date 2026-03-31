<template>
  <aside class="session-sidenav">
    
    <div class="session-sidenav-section">
      <button 
        class="dropdown-toggle" 
        @click="isCamerasOpen = !isCamerasOpen"
        type="button"
        aria-label="Toggle Connected Cameras"
      >
        <h2 class="session-sidenav-title">Connected Cameras</h2>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2" 
          stroke-linecap="round" 
          stroke-linejoin="round"
          class="chevron"
          :class="{ 'open': isCamerasOpen }"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div v-show="isCamerasOpen" class="session-sidenav-list">
        <button 
          v-for="(camera, index) in cameras" 
          :key="`camera-${index}`" 
          class="session-sidenav-link"
          type="button"
        >
          <span class="indicator camera-indicator"></span>
          {{ camera }}
        </button>
      </div>
    </div>

    <div class="session-sidenav-section">
      <h2 class="session-sidenav-title">Sessions</h2>
      <div class="session-sidenav-list">
        <button 
          v-for="(session, index) in sessions" 
          :key="`session-${index}`" 
          class="session-sidenav-link"
          type="button"
        >
          <span class="indicator"></span>
          {{ session }}
        </button>
      </div>
    </div>

    <div class="session-sidenav-divider"></div>

    <div class="session-sidenav-bottom">
      <button 
        class="session-sidenav-action" 
        :class="{ active: activeView === 'capture' }"
        @click="emit('open-capture')"
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle></svg>
        Capture Mode
      </button>
      <button 
        class="session-sidenav-action" 
        :class="{ active: activeView === 'analysis' }"
        @click="emit('open-analysis')"
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        Analysis Mode
      </button>
    </div>

  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  activeView: 'capture' | 'analysis';
}

defineProps<Props>();

const emit = defineEmits<{
  'open-capture': [];
  'open-analysis': [];
}>();

// State for the camera dropdown (defaults to open so it's visible initially)
const isCamerasOpen = ref(true);

const sessions = ['16/4/2026', '16/4/2026', '16/4/2026', '16/4/2026'];
const cameras = ['Camera 1', 'Camera 2', 'Camera 3', 'Camera 4'];
</script>

<style scoped>
.session-sidenav {
  position: absolute;
  top: 63px;
  left: 0;
  width: 240px;
  height: calc(100% - 63px);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  scrollbar-width: none;
  background: var(--sidebar, #ffffff);
  border-right: 1px solid var(--sidenav-border, #e5e7eb);
  z-index: 10;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.session-sidenav::-webkit-scrollbar {
  display: none;
}

.session-sidenav-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Dropdown Toggle Styles */
.dropdown-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 4px 12px; /* Matched padding to align with links */
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.dropdown-toggle:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
}

.dropdown-toggle .session-sidenav-title {
  padding-left: 0; /* Reset padding since it's now on the button */
}

.chevron {
  color: var(--sidenav-title, #9ca3af);
  transition: transform 0.3s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.session-sidenav-title {
  margin: 0;
  padding-left: 12px; /* Applies to standard titles like "Sessions" */
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sidenav-title, #9ca3af);
  white-space: nowrap;
}

.session-sidenav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-sidenav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sidenav-link, #4b5563);
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.2s ease;
}

.indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--sidenav-border, #d1d5db);
  transition: background-color 0.2s ease;
}

/* Optional: Give camera indicators a specific active color like green */
.camera-indicator {
  background-color: var(--success, #10b981); 
}

.session-sidenav-link:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
  color: var(--sidenav-title, #111827);
}

.session-sidenav-link:hover .indicator:not(.camera-indicator) {
  background-color: var(--accent, #3b82f6);
}

.session-sidenav-divider {
  width: calc(100% - 24px);
  height: 1px;
  margin: 0 auto;
  background: var(--sidenav-divider, #e5e7eb);
}

.session-sidenav-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
}

.session-sidenav-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sidenav-action, #4b5563);
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.session-sidenav-action svg {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.session-sidenav-action:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
  color: var(--sidenav-action-hover, #111827);
}

.session-sidenav-action:hover svg {
  opacity: 1;
}

.session-sidenav-action.active {
  background: var(--accent-light, rgba(59, 130, 246, 0.1));
  color: var(--accent, #2563eb);
}

.session-sidenav-action.active svg {
  opacity: 1;
  stroke: var(--accent, #2563eb);
}

@media (max-width: 768px) {
  .session-sidenav {
    display: none;
  }
}
</style>