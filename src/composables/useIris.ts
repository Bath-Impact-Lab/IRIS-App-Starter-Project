import { ref, onBeforeUnmount } from 'vue';

export interface UseIrisOptions {
  pingIntervalMs?: number; // how often to ping
  timeoutMs?: number; // if no pong within this window, consider offline and request restart
  onMessage?: (msg: any) => void; // pass-through message tap for UI/debug overlay
}

export function useIris(options: UseIrisOptions = {}) {
  const pingIntervalMs = options.pingIntervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 15000;

  const connected = ref(false);
  const lastPongAt = ref<number | null>(null);
  const lastAnyMsgAt = ref<number | null>(null);

  let unsub: null | (() => void) = null;
  let pingTimer: any = null;
  let watchdogTimer: any = null;

  function send(msg: any) {
    try { return (window as any).electronAPI?.irisSend?.(msg); } catch { /* no-op */ }
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      send({ type: 'ping', ts: Date.now() });
    }, pingIntervalMs);
  }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

  function startWatchdog() {
    stopWatchdog();
    watchdogTimer = setInterval(async () => {
      const now = Date.now();
      const last = lastPongAt.value ?? lastAnyMsgAt.value ?? 0;
      if (last === 0) return;
      if (now - last > timeoutMs) {
        connected.value = false;
        // Ask Electron main to restart the IRIS child process
        try { await (window as any).electronAPI?.irisRestart?.(); } catch {}
        // reset timestamps; composable will mark connected once hello/pong arrives after restart
        lastPongAt.value = null;
        lastAnyMsgAt.value = null;
      }
    }, Math.min(timeoutMs, 5000));
  }
  function stopWatchdog() { if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; } }

  function init() {
    // subscribe to messages
    try {
      unsub = (window as any).electronAPI?.irisSubscribe?.((msg: any) => {
        lastAnyMsgAt.value = Date.now();
        connected.value = true;
        if (msg?.type === 'pong' || msg?.type === 'hello') {
          lastPongAt.value = Date.now();
        }
        options.onMessage?.(msg);
      }) ?? null;
    } catch {
      // running web-only? leave connected=false
    }
    startPing();
    startWatchdog();
  }

  function dispose() {
    try { unsub?.(); } catch {}
    unsub = null;
    stopPing();
    stopWatchdog();
  }

  return { connected, lastPongAt, lastAnyMsgAt, send, init, dispose } as const;
}
