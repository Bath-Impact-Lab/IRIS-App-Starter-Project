import { computed, ref } from 'vue';

const trackingOptions = ['Full body', 'Hand', 'Face'] as const;
const personCountOptions = ['Single Person', 'Multi-Person'] as const;
const outputOptions = ['SteamVR', 'VR Chat', 'Quest', 'Unity', 'Unreal', 'Gadot', 'Filesystem'] as const;
const avatarOptions = [
  { label: 'None', file: null },
  { label: 'Mutant', file: 'avatars/Mutant.fbx' },
] as const;

const trackingType = ref<string | null>('Full body');
const personCount = ref<string | null>('Single Person');
const outputOption = ref<string | null>(null);
const selectedAvatar = ref<string | null>(null);
const irisData = ref<IrisData[] | IrisData | null>(null);
const running = ref(false);
const irisDisplayFps = ref(0);

function normalizeFrame(frame: IrisData): IrisData {
  if (frame.people?.length) return frame;

  const people = frame.entities?.map((entity) => {
    const jointCenters = entity.skeleton?.keypoints_3d?.map((point) => [point.x, point.y, point.z] as [number, number, number]) ?? [];

    return {
      person_id: entity.id ?? 0,
      joint_angles: entity.analysis?.joint_angles ?? null,
      joint_centers: jointCenters,
      points_2d: [],
      skeleton: {
        joint_centers: jointCenters,
      },
    };
  }) ?? [];

  return {
    ...frame,
    people,
  };
}

function normalizePayload(value: IrisData[] | IrisData | null) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(normalizeFrame);
  return normalizeFrame(value);
}

const jointAngles = computed(() => {
  const frame = Array.isArray(irisData.value) ? irisData.value[0] : irisData.value;
  return frame?.entities?.[0]?.analysis?.joint_angles ?? frame?.people?.[0]?.joint_angles ?? null;
});

const jointAnglesPretty = computed(() => (
  jointAngles.value ? JSON.stringify(jointAngles.value, null, 2) : ''
));

let browserMockTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function selectTracking(value: string) {
  trackingType.value = value;
}

function selectPersonCount(value: string) {
  personCount.value = value;
}

function selectOutput(value: string) {
  outputOption.value = value;
}

function selectAvatar(file: string | null) {
  selectedAvatar.value = file;
}

function setIrisData(value: IrisData[] | IrisData | null) {
  irisData.value = normalizePayload(value);
}

function setRunning(value: boolean) {
  running.value = value;
}

function init() {
  if (initialized) return;
  initialized = true;

  window.ipc?.onIrisData((data) => {
    irisData.value = normalizePayload(data);
  });

  if (!window.ipc) {
    fetch('/assets/mock-halpe26-stream.json')
      .then((response) => response.json())
      .then((positions: IrisData[]) => {
        if (!Array.isArray(positions) || positions.length === 0) return;

        let frame = 0;
        browserMockTimer = setInterval(() => {
          irisData.value = normalizeFrame(positions[frame]);
          frame = (frame + 1) % positions.length;
        }, 1000 / 30);
      })
      .catch((err) => {
        console.warn('[browser mock] could not load mock-halpe26-stream.json', err);
      });
  }
}

function dispose() {
  if (browserMockTimer) {
    clearInterval(browserMockTimer);
    browserMockTimer = null;
  }
}

export function useIrisStore() {
  return {
    trackingOptions,
    trackingType,
    personCountOptions,
    personCount,
    outputOptions,
    outputOption,
    avatarOptions,
    selectedAvatar,
    irisData,
    running,
    irisDisplayFps,
    jointAngles,
    jointAnglesPretty,
    selectTracking,
    selectPersonCount,
    selectOutput,
    selectAvatar,
    setIrisData,
    setRunning,
    init,
    dispose,
  } as const;
}
