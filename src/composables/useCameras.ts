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
  const selectedDeviceId = ref<string[] | null>(null);
  const selectedDevices = ref<MediaDeviceInfo[] | null>(null);

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
        const stillThere = devices.value.some(d => (selectedDeviceId.value ? selectedDeviceId.value : []).includes(d.deviceId));
        if (!stillThere) {
          // previously selected removed
          const removedMsg = { type: 'camera-removed', payload: { deviceId: selectedDeviceId.value, ts: Date.now() } };
          send(removedMsg);
          // Try to reselect same id from persisted storage if different? Not available; fall back to no selection.
          selectedDeviceId.value = null;
          selectedDevices.value = null;
        }
      }
      // If no current selection and we have a persisted one, reapply
      if (autoReselect && !selectedDeviceId.value) {
        const persistedId = localStorage.getItem(persistKey);
        if (persistedId) {
          const found = devices.value.find(d => d.deviceId === persistedId);
          if (found) {
            // Reselect silently (no side-effects beyond local state)
            selectedDeviceId.value = [found.deviceId];
            selectedDevices.value = [found];
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
    if (selectedDeviceId.value && selectedDeviceId.value.includes(d.deviceId) && selectedDevices.value) {
      let idx = selectedDevices.value.indexOf(d);
      selectedDeviceId.value.splice(idx, 1);
      selectedDevices.value.splice(idx, 1);
      console.log(selectedDevices.value)
      if (selectedDeviceId.value.length <= 0 || selectedDevices.value.length <= 0) {
        selectedDeviceId.value = null;
        selectedDevices.value = null;
      }

    }
    else if (selectedDevices.value && selectedDeviceId.value) {
      selectedDeviceId.value = selectedDeviceId.value.concat([d.deviceId]);
      selectedDevices.value =  selectedDevices.value.concat([d]);
    }
    else {
      selectedDeviceId.value = [d.deviceId];
      selectedDevices.value = [d];
    }

    try { localStorage.setItem(persistKey, d.deviceId); } catch {}
  }

  function init() {
    // Load persisted selection early
    try { 
      let temp = localStorage.getItem(persistKey);
      if (temp) {
        selectedDeviceId.value = [temp]; 
      }
      else {
        selectedDeviceId.value = null;
      }
    } catch {}
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
    selectedDevices,
    enumerateCameras,
    selectDevice,
    init,
    dispose,
  } as const;
}