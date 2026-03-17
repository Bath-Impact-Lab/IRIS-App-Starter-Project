<template>
  <Transition name="fade">
    <div v-if="showIrisNotFound" class="iris-missing-overlay">
      <div class="iris-missing-dialog">
        <div class="iris-missing-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="iris-missing-title">IRIS Engine Not Found</h2>
        <p class="iris-missing-body">
          Please download and install IRIS to continue.
        </p>
        <a
          class="btn iris-missing-download-btn"
          href="#"
          @click.prevent="openIrisDownload"
        >
          Download IRIS from iris.cs.bath.ac.uk
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
        <p class="iris-missing-checking">
          <span class="iris-missing-pulse"></span>
          Checking for installation
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useUIStore } from '../../stores/useUIStore';

const { showIrisNotFound } = useUIStore();

function openIrisDownload() {
  void window.electronAPI?.openExternal('https://iris.cs.bath.ac.uk/');
}
</script>
