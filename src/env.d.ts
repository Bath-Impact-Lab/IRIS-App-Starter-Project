/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  ipc?: {
    startIRIS: (options: any) => Promise<any>;
    stopIRIS: (Id: any) => Promise<any>;
    onIrisData: (callback: (data: any) => void) => void;
  }
} 