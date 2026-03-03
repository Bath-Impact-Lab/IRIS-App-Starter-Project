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


  async function enumerateCameras() {
    await ensurePermission();
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      devices.value = list.filter(d => d.kind === 'videoinput');
      // Send camera-list every time we enumerate
      const payload = toListPayload(devices.value);
    } catch (err) {
      // Fallback mock device when enumeration fails
      devices.value = [{ deviceId: 'mock-0', groupId: 'mock', kind: 'videoinput', label: 'Mock IRIS Camera', toJSON(){return this as any;} } as any];
      const payload = toListPayload(devices.value);
    }
  }

  function selectDevice(d: MediaDeviceInfo) {
    if (selectedDeviceId.value && selectedDeviceId.value.includes(d.deviceId) && selectedDevices.value) {
      let idx = selectedDevices.value.indexOf(d);
      let idx2 = selectedDeviceId.value.indexOf(d.deviceId)
      const remove = idx < 0 ? idx2 : idx
      selectedDeviceId.value.splice(remove, 1);
      selectedDevices.value.splice(remove, 1);
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