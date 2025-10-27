import { ref, onMounted, onBeforeUnmount, Ref } from 'vue';

export interface CameraListItem {
  deviceId: string;
  label: string;
  kind: string;
}

export interface UseCamerasOptions {
  autoReselect?: boolean;
  persistKey?: string; // localStorage key
  onSend?: (msg: any) => void; // notify UI (debug overlay) about messages we send
}

export function useCameras(options: UseCamerasOptions = {}) {
  const autoReselect = options.autoReselect ?? true;
  const persistKey = options.persistKey ?? 'iris.selectedCameraId';

  const devices = ref<MediaDeviceInfo[]>([]);
  const selectedDeviceId = ref<string | null>(null);
  const selectedDeviceLabel = ref<string | null>(null);

  let deviceChangeHandler: (() => void) | null = null;

  async function ensurePermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
    } catch {
      // ignore; enumeration may still work but labels could be empty
    }
  }

  function toListPayload(list: MediaDeviceInfo[]): CameraListItem[] {
    return list
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
  }

  function send(msg: any) {
    try {
      (window as any).electronAPI?.irisSend?.(msg);
      options.onSend?.(msg);
    } catch {}
  }

  async function enumerateCameras() {
    await ensurePermission();
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      devices.value = list.filter(d => d.kind === 'videoinput');
      // Send camera-list every time we enumerate
      const payload = toListPayload(devices.value);
      const msg = { type: 'camera-list', payload, ts: Date.now() };
      send(msg);
      // Auto reselect if desired
      if (autoReselect && selectedDeviceId.value) {
        const stillThere = devices.value.some(d => d.deviceId === selectedDeviceId.value);
        if (!stillThere) {
          // previously selected removed
          const removedMsg = { type: 'camera-removed', payload: { deviceId: selectedDeviceId.value, ts: Date.now() } };
          send(removedMsg);
          // Try to reselect same id from persisted storage if different? Not available; fall back to no selection.
          selectedDeviceId.value = null;
          selectedDeviceLabel.value = null;
        }
      }
      // If no current selection and we have a persisted one, reapply
      if (autoReselect && !selectedDeviceId.value) {
        const persistedId = localStorage.getItem(persistKey);
        if (persistedId) {
          const found = devices.value.find(d => d.deviceId === persistedId);
          if (found) {
            // Reselect silently (no side-effects beyond local state)
            selectedDeviceId.value = found.deviceId;
            selectedDeviceLabel.value = found.label || `Camera ${found.deviceId.substring(0,6)}`;
          }
        }
      }
    } catch (err) {
      // Fallback mock device when enumeration fails
      devices.value = [{ deviceId: 'mock-0', groupId: 'mock', kind: 'videoinput', label: 'Mock IRIS Camera', toJSON(){return this as any;} } as any];
      const payload = toListPayload(devices.value);
      const msg = { type: 'camera-list', payload, ts: Date.now() };
      send(msg);
    }
  }

  function selectDevice(d: MediaDeviceInfo) {
    selectedDeviceId.value = d.deviceId;
    selectedDeviceLabel.value = d.label || `Camera ${d.deviceId.substring(0,6)}`;
    try { localStorage.setItem(persistKey, d.deviceId); } catch {}
  }

  function init() {
    // Load persisted selection early
    try { selectedDeviceId.value = localStorage.getItem(persistKey); } catch {}
    enumerateCameras();
    const handler = async () => { await enumerateCameras(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    deviceChangeHandler = () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }

  function dispose() {
    deviceChangeHandler?.();
    deviceChangeHandler = null;
  }

  return {
    devices,
    selectedDeviceId,
    selectedDeviceLabel,
    enumerateCameras,
    selectDevice,
    init,
    dispose,
  } as const;
}
