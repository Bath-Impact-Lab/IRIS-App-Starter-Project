/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface IrisKeypoint3D {
  conf: number;
  joint_idx: number;
  x: number;
  y: number;
  z: number;
}

interface IrisEntity {
  id?: number;
  analysis?: {
    joint_angles?: Record<string, number> | null;
  };
  skeleton?: {
    keypoints_3d?: IrisKeypoint3D[];
  };
}

interface IrisPerson {
  person_id: number;
  joint_angles?: Record<string, number> | null;
  joint_centers: [number, number, number][];
  points_2d: [number, number][];
  skeleton: {
    joint_centers: [number, number, number][];
  };
}

interface IrisData {
  people: IrisPerson[];
  entities?: IrisEntity[];
}

interface IrisStartResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
  configPath?: string;
  pipeStarted?: boolean;
  wsUrl?: string;
}

interface Window {
  electronAPI?: {
    openExternal: (url: string) => {ok: boolean, error?: string},
  }
  ipc?: {
    startIRIS: (options: any) => Promise<IrisStartResult>;
    startIRISStream: (options: any) => Promise<IrisStartResult>;
    stopIRIS: (Id: string | null) => Promise<{ ok: boolean; error?: string; sessionId?: string }>;
    getExtrinsics: () => Promise<any>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;
    calculateIntrinsics: (index: number, rotation: number) => Promise<{ok: boolean, path?: string}>;
    cancelIntrinsics: () => Promise<{ok: boolean}>;
    intrinsicsComplete: (callback: (data: {idx: number, path: string}) => void) => void;
    calculateExtrinsics: (cameraIndices: number[], rotation: number) => Promise<{ok: boolean}>;
    cancelExtrinsics: () => Promise<{ok: boolean}>;
    extrinsicsComplete: (callback: (data: {ok: boolean, message?: string, error?: string}) => void) => void;
    startMonitor: (outputDir: string) => Promise<{ok: boolean, outputDir?: string, error?: string}>;
    stopMonitor: () => Promise<{ok: boolean}>;
    checkIrisCli: () => Promise<{found: boolean, path: string}>;
    onIrisCliOutput: (callback: (data: {channel: string; cameraIndex?: number; line: string}) => void) => void;
    connectVR: () => void;
    updatePos: (val: string) => void;
    disconnectVR: () => void;
    fsGetDefaultRecordingsDir: () => Promise<string>;
    fsListRecordings: (rootDir: string) => Promise<{ name: string; path: string }[]>;
    fsRenameRecording: (oldPath: string, newName: string) => Promise<{ ok: boolean; newPath?: string; error?: string }>;
    fsGetRecordingData: (recordingPath: string) => Promise<{ positions?: IrisData[]; videoFiles?: { index: number; name: string; path: string }[] }>;
    fsGetVideoUrl: (filePath: string) => Promise<string>;
  }
}
