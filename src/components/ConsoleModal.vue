<template>
  <Transition name="fade">
    <div v-if="props.show" class="console-overlay" @click.self="emit('close')">
      <div class="console-modal fade-up">
        <!-- Header -->
        <div class="console-header">
          <div class="console-title-row">
            <span class="console-dot" :class="statusClass"></span>
            <span class="console-title">{{ props.title || 'IRIS Console' }}</span>
          </div>
          <button class="console-close" @click="emit('close')">×</button>
        </div>

        <!-- Output body -->
        <div class="console-body" ref="bodyRef">
          <div v-if="props.lines.length === 0" class="console-empty">
            Waiting for output…
          </div>
          <div
            v-for="(line, i) in props.lines"
            :key="i"
            class="console-line"
            :class="lineClass(line)"
          >
            <span class="console-prompt">›</span>
            <span>{{ line }}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="console-footer">
          <span class="console-status-text">{{ statusLabel }}</span>
          <button v-if="props.canClose" class="btn-close-ok" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';

interface Props {
  show: boolean;
  title?: string;
  lines: string[];
  /** 'running' | 'success' | 'error' | 'idle' */
  status?: string;
  canClose?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const bodyRef = ref<HTMLElement | null>(null);

const statusClass = computed(() => ({
  'dot-running': props.status === 'running',
  'dot-success': props.status === 'success',
  'dot-error':   props.status === 'error',
  'dot-idle':    !props.status || props.status === 'idle',
}));

const statusLabel = computed(() => {
  if (props.status === 'running') return 'Running…';
  if (props.status === 'success') return 'Completed successfully';
  if (props.status === 'error')   return 'Finished with errors';
  return 'Idle';
});

function lineClass(line: string) {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fail'))   return 'line-error';
  if (l.includes('warn'))                           return 'line-warn';
  if (l.includes('saved') || l.includes('success')) return 'line-success';
  return '';
}

// Auto-scroll to bottom whenever lines change
watch(
  () => props.lines.length,
  async () => {
    await nextTick();
    if (bodyRef.value) {
      bodyRef.value.scrollTop = bodyRef.value.scrollHeight;
    }
  }
);
</script>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */
.console-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Modal box ───────────────────────────────────────────────────────────── */
.console-modal {
  background: #0d1117;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  width: min(680px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
  flex-shrink: 0;
}
.console-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.console-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.02em;
}
.console-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-running { background: #f5a623; animation: pulse 1.2s ease-in-out infinite; }
.dot-success { background: #3fb950; }
.dot-error   { background: #f85149; }
.dot-idle    { background: rgba(255,255,255,0.2); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.console-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  transition: color 0.15s;
}
.console-close:hover { color: rgba(255, 255, 255, 0.85); }

/* ── Body / log ──────────────────────────────────────────────────────────── */
.console-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.75);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
}
.console-body::-webkit-scrollbar { width: 6px; }
.console-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}
:global([data-theme="light"]) .console-body {
  scrollbar-color: rgba(31,78,121,0.2) transparent;
}
:global([data-theme="light"]) .console-body::-webkit-scrollbar-thumb {
  background: rgba(31,78,121,0.2);
}

.console-empty {
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
}

.console-line {
  display: flex;
  gap: 8px;
  white-space: pre-wrap;
  word-break: break-all;
}
.console-prompt { color: rgba(255, 255, 255, 0.2); flex-shrink: 0; }
.line-error { color: #f85149; }
.line-warn  { color: #e3b341; }
.line-success { color: #3fb950; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.console-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}
.console-status-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}
.btn-close-ok {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  padding: 5px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-close-ok:hover { background: rgba(255, 255, 255, 0.14); }

/* ── Transition ──────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

.fade-up {
  animation: slideUp 0.22s ease both;
}
@keyframes slideUp {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
</style>

