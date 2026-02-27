import { ref, watch, type Ref } from 'vue';
import * as THREE from 'three';
import mockExtrinsicsFallback from '../assets/mockExtrinsics.json';

export interface SceneCameraDef {
  name: string;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  color: string;
}

export interface SceneCameraEntry {
  name: string;
  color: string;
  camera: THREE.PerspectiveCamera;
  gizmoMesh: THREE.Group;
  frustumLines: THREE.LineSegments;
  visible: boolean;
}

export interface CameraFootprint {
  color: string;
  polygon: THREE.Vector3[];
}

export interface PlaySpaceBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number; // suggested capture height
  centerX: number; centerZ: number;
  width: number; depth: number;
  polygons: THREE.Vector3[][]; // intersection footprint polygons
  cameraFootprints: CameraFootprint[]; // per-camera floor polygons
}

const GIZMO_SCALE = 0.2;

function createCameraGizmo(
  position: { x: number; y: number; z: number },
  lookAt: { x: number; y: number; z: number },
  color: string,
  rotationDeg: number = 0,
): THREE.Group {
  const s = GIZMO_SCALE;

  const hw = s * 0.8;
  const hh = s * 0.45;

  const fd = s * 1.6;

  const apex: [number, number, number] = [0, 0, 0];

  const tl: [number, number, number] = [-hw, hh, fd];
  const tr: [number, number, number] = [hw, hh, fd];
  const br: [number, number, number] = [hw, -hh, fd];
  const bl: [number, number, number] = [-hw, -hh, fd];

  const lineVerts = new Float32Array([
    ...tl, ...tr,
    ...tr, ...br,
    ...br, ...bl,
    ...bl, ...tl,

    ...apex, ...tl,
    ...apex, ...tr,
    ...apex, ...br,
    ...apex, ...bl,
  ]);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lineVerts, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: true,
  });

  const lines = new THREE.LineSegments(lineGeo, lineMat);

  // Apply camera body rotation around the local Z axis (the viewing direction)
  const rotRad = (rotationDeg * Math.PI) / 180;
  lines.rotation.z = rotRad;

  const gap = s * 0.08;
  const triH = s * 0.3;
  const triW = s * 0.25;
  const triY = hh + gap;

  const triVerts = new Float32Array([
    -triW, triY, fd,
    triW, triY, fd,
    0, triY + triH, fd,
  ]);

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(triVerts, 3));
  triGeo.setIndex([0, 1, 2]);

  const triMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    depthTest: true,
  });

  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.rotation.z = rotRad;

  const group = new THREE.Group();
  group.add(lines);
  group.add(triMesh);

  group.position.set(position.x, position.y, position.z);

  group.lookAt(lookAt.x, lookAt.y, lookAt.z);

  return group;
}

// Segments layout (each = 2 verts × 3 floats = 6 floats):
//  0-3   : apex → 4 floor corners  (4 segs)
//  4-7   : near-plane rectangle    (4 segs)
//  8-11  : near corner → floor corner (4 segs)
//  12-15 : floor rectangle         (4 segs)
// Total: 16 segments = 96 floats
const FRUSTUM_SEG_COUNT = 16;

function createFrustumLines(cam: THREE.PerspectiveCamera, color: string): THREE.LineSegments {
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.2,
    depthTest: true,
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FRUSTUM_SEG_COUNT * 6), 3));

  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  return lines;
}

function updateFrustumLines(entry: SceneCameraEntry) {
  const cam = entry.camera;
  cam.updateMatrixWorld(true);

  const fovV = THREE.MathUtils.degToRad(cam.fov);
  const halfV = fovV / 2;
  const aspect = cam.aspect;
  const tanV = Math.tan(halfV);
  const tanH = tanV * aspect;

  const camPos = new THREE.Vector3();
  cam.getWorldPosition(camPos);

  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  cam.matrixWorld.extractBasis(xAxis, yAxis, zAxis);
  const fwd = zAxis.clone().multiplyScalar(-1);

  // 4 frustum corner directions (normalised)
  const dirs = [
    fwd.clone().add(xAxis.clone().multiplyScalar( tanH)).add(yAxis.clone().multiplyScalar( tanV)), // TL
    fwd.clone().add(xAxis.clone().multiplyScalar( tanH)).add(yAxis.clone().multiplyScalar(-tanV)), // BL
    fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(-tanV)), // BR
    fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar( tanV)), // TR
  ].map(d => d.normalize());

  // Near plane distance (fixed visual distance from camera)
  const nearDist = 0.5;

  // Near-plane corner world positions
  const nearCorners = dirs.map(d => camPos.clone().addScaledVector(d, nearDist));

  // Floor intersection for each ray
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const EPS = 1e-6;
  const MAX_DIST = 20;

  const floorCorners = dirs.map(dir => {
    const denom = floorPlane.normal.dot(dir);
    if (Math.abs(denom) > EPS) {
      const t = -(floorPlane.normal.dot(camPos) + floorPlane.constant) / denom;
      if (t > EPS && t < MAX_DIST) {
        return camPos.clone().addScaledVector(dir, t);
      }
    }
    // Ray doesn't hit floor within range – project to MAX_DIST
    return camPos.clone().addScaledVector(dir, MAX_DIST);
  });

  const verts = new Float32Array(FRUSTUM_SEG_COUNT * 6);
  let s = 0; // segment index

  const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
    verts[s * 6] = a.x; verts[s * 6 + 1] = a.y; verts[s * 6 + 2] = a.z;
    verts[s * 6 + 3] = b.x; verts[s * 6 + 4] = b.y; verts[s * 6 + 5] = b.z;
    s++;
  };

  // 1. Apex → floor corners (4 rays that define the frustum sides)
  for (let i = 0; i < 4; i++) seg(camPos, floorCorners[i]);

  // 2. Near-plane rectangle
  for (let i = 0; i < 4; i++) seg(nearCorners[i], nearCorners[(i + 1) % 4]);

  // 3. Near corner → floor corner (frustum edges from near to far)
  for (let i = 0; i < 4; i++) seg(nearCorners[i], floorCorners[i]);

  // 4. Floor footprint rectangle
  for (let i = 0; i < 4; i++) seg(floorCorners[i], floorCorners[(i + 1) % 4]);

  const posAttr = entry.frustumLines.geometry.attributes.position as THREE.BufferAttribute;
  (posAttr.array as Float32Array).set(verts);
  posAttr.needsUpdate = true;
}

export function useSceneCameras(selectedCount?: Ref<number>, showFrustums?: Ref<boolean>, showGizmos?: Ref<boolean>) {
  const sceneCameras = ref<SceneCameraEntry[]>([]);
  let attachedScene: THREE.Scene | null = null;

  const COLORS = ['#ff4466', '#44aaff', '#ffaa22', '#44dd88', '#cc44ff', '#00dddd'];

  /**
   * Convert an IRIS extrinsics entry (R row-major 3x3, t translation)
   * into a SceneCameraDef with world-space position and lookAt.
   *
   * IRIS convention: R and t define the world-to-camera transform.
   *   cam_point = R * world_point + t
   * So camera position in world space = -R^T * t
   * And the forward axis (look direction) = third row of R (Z column of R^T).
   */
  function extrinsicsToDef(entry: any, index: number, scale = 1): SceneCameraDef {
    // Support both field name variants
    const R: number[] = entry.extrinsics.rotation_matrix ?? entry.extrinsics.R;
    const t: number[] = entry.extrinsics.translation_matrix ?? entry.extrinsics.t;

    // R as rows: R[0..2]=row0, R[3..5]=row1, R[6..8]=row2
    // R^T columns become rows, so:
    // pos = -R^T * t
    const posX = -(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]) * scale;
    const posY = -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]) * scale;
    const posZ = -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]) * scale;

    // Forward direction = third row of R = [R[6], R[7], R[8]] (world Z axis of camera)
    const fwdX = R[6];
    const fwdY = R[7];
    const fwdZ = R[8];

    return {
      name: `Camera ${entry.cam_id}`,
      position: { x: posX, y: posY, z: posZ },
      lookAt: { x: posX + fwdX, y: posY + fwdY, z: posZ + fwdZ },
      color: COLORS[index % COLORS.length],
    };
  }

  let isMockExtrinsics = false;

  async function addToScene(scene: THREE.Scene) {
    attachedScene = scene;

    let defs: SceneCameraDef[] = [];

    // Try loading live extrinsics via IPC; fall back to bundled mock
    try {
      const result = await window.ipc?.getExtrinsics();
      const extrinsics = result ?? mockExtrinsicsFallback;
      isMockExtrinsics = extrinsics?._isMock === true;
      if (extrinsics?.cameras?.length) {
        const unit = (extrinsics.unit_of_measurement ?? 'm').replace(/[^a-z]/gi, '').toLowerCase();
        const scale = unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : 1;
        defs = extrinsics.cameras
          .filter((c: any) => c.success !== false)
          .map((c: any, i: number) => extrinsicsToDef(c, i, scale));
        console.log(`[cameras] loaded ${defs.length} cameras from extrinsics (mock=${isMockExtrinsics}, unit=${unit}, scale=${scale})`);
      }
    } catch (err) {
      console.warn('[cameras] failed to load extrinsics, falling back to mock', err);
      // Hard fallback — use bundled mock directly
      isMockExtrinsics = true;
      defs = mockExtrinsicsFallback.cameras
        .filter((c: any) => c.success !== false)
        .map((c: any, i: number) => extrinsicsToDef(c, i, 1));
    }

    for (const def of defs) {
      const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
      cam.position.set(def.position.x, def.position.y, def.position.z);
      cam.lookAt(def.lookAt.x, def.lookAt.y, def.lookAt.z);
      cam.name = def.name;
      cam.updateProjectionMatrix();

      const gizmoMesh = createCameraGizmo(def.position, def.lookAt, def.color);
      gizmoMesh.name = `${def.name}_gizmo`;
      gizmoMesh.visible = false;

      const frustumLines = createFrustumLines(cam, def.color);
      frustumLines.name = `${def.name}_frustum`;
      frustumLines.visible = false;

      scene.add(cam);
      scene.add(gizmoMesh);
      scene.add(frustumLines);

      const entry: SceneCameraEntry = {
        name: def.name,
        color: def.color,
        camera: cam,
        gizmoMesh,
        frustumLines,
        visible: false,
      };

      updateFrustumLines(entry);
      sceneCameras.value.push(entry);
    }

    syncVisibility();
  }

  /** Show all cameras in mock mode; otherwise show only the first N matching selected physical cameras. */
  function syncVisibility(forceShowFrustums?: boolean, forceShowGizmos?: boolean) {
    const count = selectedCount?.value ?? 0;
    const showAll = isMockExtrinsics && count === 0;
    const frustumVis = forceShowFrustums !== undefined ? forceShowFrustums : (showFrustums?.value ?? true);
    const gizmoVis = forceShowGizmos !== undefined ? forceShowGizmos : (showGizmos?.value ?? true);

    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = showAll || i < count;
      const entry = sceneCameras.value[i];
      entry.gizmoMesh.visible = show && gizmoVis;
      entry.frustumLines.visible = show && frustumVis;
      entry.visible = show;
    }
  }

  /** Update the rotation of a scene camera gizmo by index. */
  function setGizmoRotation(index: number, rotationDeg: number) {
    const entry = sceneCameras.value[index];
    if (!entry) return;

    const rotRad = (rotationDeg * Math.PI) / 180;
    // Both children (lines + triangle) rotate together
    for (const child of entry.gizmoMesh.children) {
      child.rotation.z = rotRad;
    }
  }

  /**
   * Projects each visible camera's frustum onto the floor (Y = 0) and returns
   * the AABB of the intersection of all footprints — i.e. the area that every
   * active camera can see.  Falls back to the full union if there is no overlap.
   */
  function computePlaySpaceBounds(captureHeight = 2.5): PlaySpaceBounds {
    const visibleCams = sceneCameras.value.filter(e => e.visible);

    const emptyBounds: PlaySpaceBounds = {
      minX: -2, maxX: 2, minZ: -2, maxZ: 2,
      height: captureHeight, centerX: 0, centerZ: 0, width: 4, depth: 4,
      polygons: [],
      cameraFootprints: [],
    };

    if (visibleCams.length < 2) return emptyBounds;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const footprints: THREE.Vector3[][] = [];
    const cameraFootprints: CameraFootprint[] = [];

    // 1. Get ground footprints for each camera
    for (const entry of visibleCams) {
      const cam = entry.camera;
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();

      const fovV = THREE.MathUtils.degToRad(cam.fov);
      const halfV = fovV / 2;
      const aspect = cam.aspect;
      const tanV = Math.tan(halfV);
      const tanH = tanV * aspect;

      const camPos = cam.getWorldPosition(new THREE.Vector3());
      const xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
      cam.matrixWorld.extractBasis(xAxis, yAxis, zAxis);
      const fwd = zAxis.clone().multiplyScalar(-1);

      const poly: THREE.Vector3[] = [];
      const dirs = [
        fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(tanV)),
      ].map(d => d.normalize());

      for (const dir of dirs) {
        const denom = plane.normal.dot(dir);
        if (Math.abs(denom) > 1e-6) {
          const t = -plane.normal.dot(camPos) / denom;
          if (t > 0) poly.push(camPos.clone().addScaledVector(dir, t));
        }
      }
      if (poly.length === 4) {
        footprints.push(poly);
        cameraFootprints.push({ color: entry.color, polygon: poly });
      }
    }

    if (footprints.length < 2) return { ...emptyBounds, cameraFootprints };

    // 2. Pairwise Footprint Intersection logic
    // Sutherland-Hodgman clipping to find intersection of two convex 2D polygons
    const getLineIntersection = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      const det = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
      if (Math.abs(det) < 1e-8) return null;
      const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / det;
      return new THREE.Vector3(a.x + t * (b.x - a.x), 0, a.z + t * (b.z - a.z));
    };

    const clipPoly = (subjectPoly: THREE.Vector3[], clipPoly: THREE.Vector3[]) => {
      let outputList = subjectPoly;
      for (let i = 0; i < clipPoly.length; i++) {
        const edgeStart = clipPoly[i];
        const edgeEnd = clipPoly[(i + 1) % clipPoly.length];
        const inputList = outputList;
        outputList = [];
        if (inputList.length === 0) break;
        let startPoint = inputList[inputList.length - 1];
        for (const endPoint of inputList) {
          const isInside = (p: THREE.Vector3) =>
            ((edgeEnd.x - edgeStart.x) * (p.z - edgeStart.z) - (edgeEnd.z - edgeStart.z) * (p.x - edgeStart.x)) >= -1e-5;
          if (isInside(endPoint)) {
            if (!isInside(startPoint)) {
              const intersect = getLineIntersection(startPoint, endPoint, edgeStart, edgeEnd);
              if (intersect) outputList.push(intersect);
            }
            outputList.push(endPoint);
          } else if (isInside(startPoint)) {
            const intersect = getLineIntersection(startPoint, endPoint, edgeStart, edgeEnd);
            if (intersect) outputList.push(intersect);
          }
          startPoint = endPoint;
        }
      }
      return outputList;
    };

    const resultPolygons: THREE.Vector3[][] = [];
    for (let i = 0; i < footprints.length; i++) {
      for (let j = i + 1; j < footprints.length; j++) {
        const overlap = clipPoly(footprints[i], footprints[j]);
        if (overlap.length >= 3) resultPolygons.push(overlap);
      }
    }

    if (resultPolygons.length === 0) return { ...emptyBounds, cameraFootprints };

    // 3. Compute metadata
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    resultPolygons.forEach(p => p.forEach(v => {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }));

    return {
      minX, maxX, minZ, maxZ,
      height: captureHeight,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX, depth: maxZ - minZ,
      polygons: resultPolygons,
      cameraFootprints,
    };
  }

  /** Remove all scene camera objects and clear the list. */
  function clearSceneCameras() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      attachedScene?.remove(entry.frustumLines);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
      });
      entry.frustumLines.geometry.dispose();
      (entry.frustumLines.material as THREE.Material).dispose();
    }
    sceneCameras.value = [];
  }

  if (selectedCount) {
    let prevCount = 0;
    watch(selectedCount, async (count) => {
      if (prevCount === 0 && count > 0 && attachedScene) {
        // A real camera just connected — clear mock gizmos and reload from real extrinsics
        console.log('[cameras] real camera connected, clearing mock cameras and reloading extrinsics');
        clearSceneCameras();
        await addToScene(attachedScene);
      }
      prevCount = count;
      syncVisibility();
    });
  }

  if (showFrustums) {
    watch(showFrustums, () => syncVisibility());
  }

  if (showGizmos) {
    watch(showGizmos, () => syncVisibility());
  }

  function dispose() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      attachedScene?.remove(entry.frustumLines);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          ((child as THREE.Mesh).material as THREE.Material).dispose();
        }
      });
      entry.frustumLines.geometry.dispose();
      (entry.frustumLines.material as THREE.Material).dispose();
    }
    sceneCameras.value = [];
    attachedScene = null;
  }

  return {
    sceneCameras,
    addToScene,
    syncVisibility,
    setGizmoRotation,
    computePlaySpaceBounds,
    dispose,
  } as const;
}
