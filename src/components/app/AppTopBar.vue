<template>
  <nav ref="titlebarRef" class="navbar titlebar" @dblclick="handleTitlebarDoubleClick">
    <div class="brand">
      <img
        v-if="!logoError"
        :src="logoSrc"
        :alt="appTitle"
        class="brand-logo"
        @error="logoError = true"
      />
      <template v-else>
        <div class="split">{{ appTitle }}</div>
      </template>
    </div>

    <div class="nav-right">
      <div class="menu-right">
        <button class="btn btn-icon" @click="emit('toggle-settings')" aria-label="Settings" :disabled="disabled">
          <img src="/assets/settings.svg" alt="">
        </button>
      </div>
      <div v-if="showWindowControls" class="window-controls">
        <button class="window-control" type="button" aria-label="Minimize window" @click="minimizeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6.5H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="window-control" type="button" :aria-label="isMaximized ? 'Restore window' : 'Maximize window'" @click="toggleMaximizeWindow">
          <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2.25" y="2.25" width="7.5" height="7.5" rx="0.75" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 2.75H9.25V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7.75 4H2.75V9.25H7.75V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="window-control window-control-close" type="button" aria-label="Close window" @click="closeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 3L9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  appTitle: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  'toggle-settings': [];
}>();

const logoError = ref(false);
const logoSrc = computed(() => `/assets/logo/${props.appTitle.toLowerCase()}.png`);
const isMaximized = ref(false);
const showWindowControls = typeof window !== 'undefined' && !!window.electronAPI?.minimizeWindow;
const titlebarRef = ref<HTMLElement | null>(null);

let stopWindowStateListener: (() => void) | null = null;
let titlebarResizeObserver: ResizeObserver | null = null;

function syncTitlebarHeight() {
  const height = titlebarRef.value?.getBoundingClientRect().height;
  if (!height) return;
  document.documentElement.style.setProperty('--app-topbar-height', `${Math.round(height)}px`);
}

onMounted(async () => {
  syncTitlebarHeight();
  if (typeof ResizeObserver !== 'undefined' && titlebarRef.value) {
    titlebarResizeObserver = new ResizeObserver(() => syncTitlebarHeight());
    titlebarResizeObserver.observe(titlebarRef.value);
  }

  if (!window.electronAPI?.isWindowMaximized) return;
  const state = await window.electronAPI.isWindowMaximized();
  isMaximized.value = state.isMaximized;
  stopWindowStateListener = window.electronAPI.onWindowStateChange?.((data) => {
    isMaximized.value = data.isMaximized;
  }) ?? null;
});

onBeforeUnmount(() => {
  stopWindowStateListener?.();
  stopWindowStateListener = null;
  titlebarResizeObserver?.disconnect();
  titlebarResizeObserver = null;
});

async function minimizeWindow() {
  await window.electronAPI?.minimizeWindow?.();
}

async function toggleMaximizeWindow() {
  const state = await window.electronAPI?.toggleMaximizeWindow?.();
  if (state) {
    isMaximized.value = state.isMaximized;
  }
}

async function closeWindow() {
  await window.electronAPI?.closeWindow?.();
}

function handleTitlebarDoubleClick(event: MouseEvent) {
  if (!showWindowControls) return;
  if (event.target instanceof HTMLElement && event.target.closest('button')) return;
  void toggleMaximizeWindow();
}
</script>

<style scoped>
.titlebar {
  -webkit-app-region: drag;
  user-select: none;
}

.menu-right,
.btn-icon,
.window-controls,
.window-control {
  -webkit-app-region: no-drag;
}

.btn-icon img {
  filter: none;
}

.window-controls {
  display: flex;
  align-items: stretch;
  margin-left: 8px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(11, 15, 20, 0.28);
}

.window-control {
  width: 42px;
  border: 0;
  background: transparent;
  color: var(--fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.window-control:hover {
  background: rgba(255, 255, 255, 0.08);
}

.window-control-close:hover {
  background: #d92d20;
  color: #fff;
}

[data-theme="light"] .window-controls {
  border-color: rgba(31, 78, 121, 0.12);
  background: rgba(31, 78, 121, 0.06);
}

[data-theme="light"] .window-control:hover {
  background: rgba(31, 78, 121, 0.08);
}

[data-theme="light"] .window-control-close:hover {
  background: #d92d20;
  color: #fff;
}

@media (max-width: 768px) {
  .window-controls {
    margin-left: 4px;
  }

  .window-control {
    width: 38px;
  }
}
</style>
