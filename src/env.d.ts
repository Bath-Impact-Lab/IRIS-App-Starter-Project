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
    startIRIS: (options: any) => Promise<any>;
    startIRISStream: (options: any) => Promise<any>;
    stopIRIS: (Id: any) => Promise<any>;
    getExtrinsics: () => Promise<any>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;
    calculateIntrinsics: (index: number, rotation: number) => Promise<{ok: boolean, path?: string}>;
    cancelIntrinsics: () => Promise<{ok: boolean}>;
    intrinsicsComplete: (callback: (data: {idx: number, path: string}) => void) => void;
    calculateExtrinsics: (cameraIndices: number[]) => Promise<{ok: boolean}>;
    cancelExtrinsics: () => Promise<{ok: boolean}>;
    extrinsicsComplete: (callback: (data: {ok: boolean, message?: string, error?: string}) => void) => void;
    startMonitor: (outputDir: string) => Promise<{ok: boolean, outputDir?: string, error?: string}>;
    stopMonitor: () => Promise<{ok: boolean}>;
    checkIrisCli: () => Promise<{found: boolean, path: string}>;
    onIrisCliOutput: (callback: (data: {channel: string; cameraIndex?: number; line: string}) => void) => void;
  }
} 
