<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useProject } from '@/lib/useProject';

// ── Layout & Core UI ─────────────────────────────────────────────────────────
import AppTopBar from '@/components/app/AppTopBar.vue';
import SessionSidenav from '@/components/app/SessionSidenav.vue';
import Toolbar from '@/components/app/Toolbar.vue';

// ── Pages / Views ────────────────────────────────────────────────────────────
import ProjectHome from '@/components/ProjectHome.vue';
import FeedViewPage from '@/components/FeedViewPage.vue';
import ThreeWindow from '@/components/threeWindow.vue';
import AnalysisWindow from '@/components/analysisWindow.vue';

// ── Modals & Overlays ────────────────────────────────────────────────────────
import SettingsModal from '@/components/settingsModal.vue';

const { 
  hasCurrentProject, 
  currentProject, 
  recentProjects,
  createProject, 
  openProject,
  setCurrentProject
} = useProject();

// View State Routing
const activeView = computed(() => currentProject.value?.workspace.activeView || 'capture');

// Global Settings State
const showSettings = ref(false);
const currentTheme = ref<'dark' | 'light'>('light');

// Apply theme to document root for global CSS variable targeting
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', currentTheme.value);
});

// View Navigation Handler
function setView(view: 'capture' | 'mocap' | 'analysis') {
  if (currentProject.value) {
    currentProject.value.workspace.activeView = view;
  }
}

const selectedResolution = computed(() => currentProject.value?.workspace.resolution ?? '1920x1080');
const selectedFps = computed(() => currentProject.value?.workspace.fps ?? 30);

function updateResolution(value: string) {
  if (!currentProject.value) return;
  currentProject.value.workspace.resolution = value;
}

function updateFps(value: number) {
  if (!currentProject.value) return;
  currentProject.value.workspace.fps = value;
}
</script>

<template>
  <div id="app-container" :data-theme="currentTheme">
    
    <AppTopBar 
      appTitle="ReCapture" 
      :disabled="!hasCurrentProject"
      @toggle-settings="showSettings = !showSettings" 
      @navigate-home="setCurrentProject(null)"
    />

    <ProjectHome 
      v-if="!hasCurrentProject" 
      :recentProjects="recentProjects"
      @new-project="createProject()" 
      @open-project="openProject()"
      @open-recent="openProject($event)"
    />

    <template v-else>
      <SessionSidenav 
        :activeView="activeView"
        :participants="currentProject.participants"
        @open-capture="setView('capture')"
        @open-mocap="setView('mocap')"
        @open-analysis="setView('analysis')"
      />

      <main class="workspace-content">
        <FeedViewPage v-if="activeView === 'capture'" />
        <div v-else-if="activeView === 'mocap'" class="mocap-stage">
          <div class="mocap-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
            />
          </div>
          <ThreeWindow />
        </div>
        <AnalysisWindow v-else-if="activeView === 'analysis'" />
      </main>
 
    </template>

    <SettingsModal 
      :showSettings="showSettings" 
      :currentTheme="currentTheme"
      @settings="showSettings = $event" 
      @setTheme="currentTheme = $event"
    />
    
  </div>
</template>

<style scoped>
#app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-content {
  position: absolute;
  /* Top Bar Height | Right Sidebar Width | Bottom | Left Sidenav Width */
  inset: var(--app-topbar-height, 63px) 0 0 var(--app-session-sidenav-width, 240px);
  overflow: hidden;
  background: var(--bg);
}

.mocap-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.mocap-stage :deep(.scene) {
  position: absolute;
  inset: 0;
}

.mocap-toolbar-shell {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 20;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
}

.mocap-toolbar-shell > * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .workspace-content {
    inset: var(--app-topbar-height, 63px) 0 0 0;
  }

  .mocap-toolbar-shell {
    top: 12px;
    left: 12px;
    right: 12px;
  }
}
  
</style>
