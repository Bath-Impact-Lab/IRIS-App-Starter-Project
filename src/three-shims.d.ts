declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  import { Loader, LoadingManager, Group } from 'three';
  export class OBJLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(url: string, onLoad: (group: Group) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: unknown) => void): void;
    parse(text: string): Group;
  }
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector3 } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    object: Camera;
    domElement: HTMLElement;
    enabled: boolean;
    target: Vector3;
    minDistance: number;
    maxDistance: number;
    enableDamping: boolean;
    dampingFactor: number;
    screenSpacePanning: boolean;
    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    touches: { ONE: TOUCH; TWO: TOUCH };
    update(): boolean;
    dispose(): void;
  }
}
