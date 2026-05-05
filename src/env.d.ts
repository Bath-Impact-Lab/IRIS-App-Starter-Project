/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
  
  interface IrisData {  
  people: {
    person_id: number;
    joint_angles: [number, number, number, number][];
    joint_centers: [number, number, number][]; // Array of 3D coordinates: [x, y, z]
    points_2d: [number, number][];
  }[];
}


interface Window {
  electronAPI?: {
    openExternal: (url: string) => {ok: boolean, error?: string},
  }
  ipc?: {
    startIRIS: (options: any) => Promise<{
      ok: boolean, 
      sessionId: string,
      configPath: string,
      pipeStarted: boolean,
      wsUrl: string | null,
    }>;
    startIRISStream: (options: any) => Promise<{
      ok: boolean, 
      sessionId: string,
      configPath: string,
      pipeStarted: boolean,
      wsUrl: string | null,
    }>;
    stopIRIS: (Id: any) => Promise<any>;
    getExtrinsics: () => Promise<any>;
    getScene: () => Promise<string | null>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;
    startMonitor: (outputDir: string) => Promise<{ok: boolean, outputDir?: string, error?: string}>;
    stopMonitor: () => Promise<{ok: boolean}>;
    checkIrisCli: () => Promise<{found: boolean, path: string}>;
    onIrisCliOutput: (callback: (data: {channel: string; cameraIndex?: number; line: string}) => void) => void;
    connectVR: (outOption: string) => Promise<string>;
    updatePos: (val: string, sessionId: string) => void;
    disconnectVR: (sessionId: string) => void;
    panicked: (callback: (data: boolean) => void) => void;
    irisClosed: (callback: (data: boolean) => void) => void;
  }
} 
