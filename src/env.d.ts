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
  baseSessionId?: string;
  engineSessionId?: string;
  monitorSessionId?: string;
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
    startIRISFull: (options: any) => Promise<IrisStartResult>;
    stopIRIS: (Id: string | null) => Promise<{ ok: boolean; error?: string; sessionId?: string }>;
    stopIRISFull: (baseSessionId: string | null) => Promise<{ ok: boolean }>;
    getExtrinsics: () => Promise<any>;
    getScene: () => Promise<string | null>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;
    startMonitor: (outputDir: string) => Promise<{ok: boolean, outputDir?: string, error?: string}>;
    stopMonitor: () => Promise<{ok: boolean}>;
    checkIrisCli: () => Promise<{found: boolean, path: string}>;
    onIrisCliOutput: (callback: (data: {channel: string; cameraIndex?: number; line: string}) => void) => void;
    connectVR: (outOption: string) => void;
    updatePos: (val: string) => void;
    disconnectVR: () => void;
    fsGetDefaultRecordingsDir: () => Promise<string>;
    fsListRecordings: (rootDir: string) => Promise<{ name: string; path: string }[]>;
    fsRenameRecording: (oldPath: string, newName: string) => Promise<{ ok: boolean; newPath?: string; error?: string }>;
    fsGetRecordingData: (recordingPath: string) => Promise<{ positions?: IrisData[]; videoFiles?: { index: number; name: string; path: string }[] }>;
    fsGetVideoUrl: (filePath: string) => Promise<string>;
  }
}
