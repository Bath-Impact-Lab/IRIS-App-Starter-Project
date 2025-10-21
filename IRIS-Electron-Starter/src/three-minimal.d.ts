declare module 'three' {
  export class WebGLRenderer { constructor(params?: any); domElement: HTMLCanvasElement; setPixelRatio(v: number): void; setSize(w:number,h:number): void; setClearColor(c:any,a?:number): void; render(scene:any,camera:any): void; dispose(): void; }
  export class Scene { add(...o:any[]): void; traverse(fn:(o:any)=>void):void; }
  export class PerspectiveCamera { constructor(fov:number,aspect:number,near:number,far:number); position: any; fov:number; near:number; far:number; aspect:number; updateProjectionMatrix(): void; lookAt(v:any):void; }
  export class HemisphereLight { constructor(sky:any, ground:any, intensity?:number); position:any }
  export class DirectionalLight { constructor(color:any, intensity?:number); position:any; castShadow:boolean }
  export class GridHelper { constructor(size:number, divisions:number, color1?:any, color2?:any) }
  export class Box3 { setFromObject(o:any): this; getSize(v:any): any; getCenter(v:any): any }
  export class Vector3 { constructor(x?:number,y?:number,z?:number); clone():Vector3; add(v:Vector3):Vector3; multiplyScalar(s:number):Vector3; set(x:number,y:number,z:number):this }
  export class Color { constructor(hex?:any); offsetHSL(h:number,s:number,l:number): this }
  export class Clock { getElapsedTime(): number }
  export class MeshStandardMaterial { constructor(params?:any); }
  export class MeshBasicMaterial { constructor(params?:any); }
  export class SphereGeometry { constructor(r:number, w?:number, h?:number) }
  export class TorusKnotGeometry { constructor(radius:number, tube:number, tubularSegments?:number, radialSegments?:number) }
  export class BufferGeometry { setAttribute(n:string, a:any): void; getAttribute(n:string): any }
  export class BufferAttribute { constructor(array:Float32Array, itemSize:number); setXYZ(index:number,x:number,y:number,z:number):void; needsUpdate:boolean }
  export class LineBasicMaterial { constructor(params?:any) }
  export class LineSegments { constructor(geom:any, mat:any); geometry:any; visible:boolean }
  export class Mesh { constructor(geom:any, mat:any); position:any; visible:boolean; }
  export class Object3D { }
  export class Group extends Object3D { }
}
