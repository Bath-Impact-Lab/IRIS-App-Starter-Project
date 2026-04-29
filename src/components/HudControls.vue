<template>
  <Transition name="fs-bar">
    <div class="hud hud-fs" v-if="isFilesystemOutput">
      <div class="fs-group">
        <button
          class="hud-icon-btn fs-btn"
          :class="{ 'fs-recording': isRecording }"
          @click="toggleRecording"
          :title="isRecording ? 'Stop Recording' : 'Start Recording'"
        >
          <svg v-if="!isRecording" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="8"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
        </button>
        <div v-if="isRecording" class="fs-rec-indicator">
          <span class="fs-rec-dot"></span>
          <span class="fs-rec-bar" style="--d:0ms; --h:10px"></span>
          <span class="fs-rec-bar" style="--d:120ms; --h:18px"></span>
          <span class="fs-rec-bar" style="--d:60ms; --h:14px"></span>
          <span class="fs-rec-bar" style="--d:180ms; --h:20px"></span>
          <span class="fs-rec-bar" style="--d:30ms; --h:12px"></span>
        </div>
        <span v-else class="fs-label fs-rec-label">Record</span>
      </div>

      <div class="fs-sep"></div>

      <div class="fs-group">
        <button class="hud-icon-btn fs-btn" @click="skipBackward" title="Skip Backward" :disabled="playbackDisabled">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="3" height="16"/>
          </svg>
        </button>
        <button
          class="hud-icon-btn fs-btn"
          :class="{ active: isPlaying }"
          @click="togglePlayback"
          :title="isPlaying ? 'Pause' : 'Play'"
          :disabled="playbackDisabled"
        >
          <svg v-if="!isPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
        </button>
        <button class="hud-icon-btn fs-btn" @click="skipForward" title="Skip Forward" :disabled="playbackDisabled">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,4 15,12 5,20"/><rect x="16" y="4" width="3" height="16"/>
          </svg>
        </button>
        <div class="fs-timeline" :class="{ 'fs-timeline-disabled': playbackDisabled }" @click="scrubTimeline" @mousemove="onTimelineHover" @mouseleave="timelineHoverX = null">
          <div class="fs-timeline-track">
            <div class="fs-timeline-fill" :style="{ width: timelinePercent + '%' }"></div>
            <div class="fs-timeline-thumb" :style="{ left: timelinePercent + '%' }"></div>
            <div v-if="timelineHoverX !== null" class="fs-timeline-hover" :style="{ left: timelineHoverX + '%' }"></div>
          </div>
        </div>
        <span class="fs-label fs-time" :class="{ 'fs-time-disabled': playbackDisabled }">{{ fsTimeDisplay }}</span>
      </div>
    </div>
  </Transition>

  <div class="hud">
    <button
      class="hud-icon-btn"
      :class="{ active: showPlaySpace }"
      @click="showPlaySpace = !showPlaySpace"
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
      @click="showCameras = !showCameras"
      title="Toggle Cameras"
      aria-label="Toggle Cameras"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
    </button>
  </div>

  <div class="hud hud-center" v-if="running">
    <span class="activity-blinker"></span>
    <span class="hud-item">IRIS Engine</span>
    <div class="hud-sep"></div>
    <span class="hud-item fps-counter">{{ irisDisplayFps }} <span class="fps-unit">FPS</span></span>
  </div>
</template>

<script setup lang="ts">
import { useFilesystemStore } from '../stores/useFilesystemStore';
import { useIrisStore } from '../stores/useIrisStore';
import { useUIStore } from '../stores/useUIStore';

const {
  fsTimeDisplay,
  isFilesystemOutput,
  isPlaying,
  isRecording,
  onTimelineHover,
  playbackDisabled,
  scrubTimeline,
  skipBackward,
  skipForward,
  timelineHoverX,
  timelinePercent,
  togglePlayback,
  toggleRecording,
} = useFilesystemStore();

const { irisDisplayFps, running } = useIrisStore();
const { showCameras, showPlaySpace } = useUIStore();
</script>
