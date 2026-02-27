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

export interface PlaySpaceBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number; // suggested capture height
  centerX: number; centerZ: number;
  width: number; depth: number;
  points: THREE.Vector3[]; // footprint polygon points
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

function createFrustumLines(cam: THREE.PerspectiveCamera, color: string): THREE.LineSegments {
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.15,
    depthTest: true,
  });

  const geo = new THREE.BufferGeometry();
  // We'll update positions in updateFrustumLines
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3 * 2), 3));

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
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const tanV = Math.tan(halfV);
  const tanH = Math.tan(halfH);

  const camPos = new THREE.Vector3();
  cam.getWorldPosition(camPos);

  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  cam.matrixWorld.extractBasis(xAxis, yAxis, zAxis);
  const fwd = zAxis.clone().multiplyScalar(-1);

  const dirs = [
    fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(tanV)),
    fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
    fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
    fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(tanV)),
  ].map(d => d.normalize());

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const EPS = 1e-6;
  const verts = new Float32Array(4 * 3 * 2);

  dirs.forEach((dir, i) => {
    const denom = plane.normal.dot(dir);
    let target = camPos.clone().addScaledVector(dir, 10); // Default 10m
    if (Math.abs(denom) > EPS) {
      const t = -plane.normal.dot(camPos) / denom;
      if (t > EPS) {
        target = camPos.clone().addScaledVector(dir, t);
      }
    }

    // Line i: camPos -> target
    verts[i * 6 + 0] = camPos.x;
    verts[i * 6 + 1] = camPos.y;
    verts[i * 6 + 2] = camPos.z;
    verts[i * 6 + 3] = target.x;
    verts[i * 6 + 4] = target.y;
    verts[i * 6 + 5] = target.z;
  });

  entry.frustumLines.geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  entry.frustumLines.geometry.attributes.position.needsUpdate = true;
}

export function useSceneCameras(selectedCount?: Ref<number>, showFrustums?: Ref<boolean>) {
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
  function syncVisibility(forceShowFrustums?: boolean) {
    const count = selectedCount?.value ?? 0;
    const showAll = isMockExtrinsics && count === 0;
    const frustumVis = forceShowFrustums !== undefined ? forceShowFrustums : (showFrustums?.value ?? true);

    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = showAll || i < count;
      const entry = sceneCameras.value[i];
      entry.gizmoMesh.visible = show;
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

    if (visibleCams.length === 0) {
      return {
        minX: -2, maxX: 2, minZ: -2, maxZ: 2,
        height: captureHeight, centerX: 0, centerZ: 0, width: 4, depth: 4,
        points: []
      };
    }

    const intersectionPts: THREE.Vector3[] = [];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const EPS = 1e-6;

    for (const entry of visibleCams) {
      const cam = entry.camera;
      cam.updateMatrixWorld(true);

      // Get camera FOV and aspect
      const fovV = THREE.MathUtils.degToRad(cam.fov);
      const halfV = fovV / 2;
      const aspect = cam.aspect;
      const halfH = Math.atan(Math.tan(halfV) * aspect);
      const tanV = Math.tan(halfV);
      const tanH = Math.tan(halfH);

      const camPos = new THREE.Vector3();
      cam.getWorldPosition(camPos);

      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      cam.matrixWorld.extractBasis(xAxis, yAxis, zAxis);

      // In Three.js PerspectiveCamera, forward is -zAxis
      const fwd = zAxis.clone().multiplyScalar(-1);

      // Ray directions for the 4 corners of the frustum
      const dirs = [
        fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(-tanV)),
        fwd.clone().add(xAxis.clone().multiplyScalar(-tanH)).add(yAxis.clone().multiplyScalar(tanV)),
      ].map(d => d.normalize());

      for (const dir of dirs) {
        const denom = plane.normal.dot(dir);
        if (Math.abs(denom) > EPS) {
          const t = -plane.normal.dot(camPos) / denom;
          if (t > EPS) {
            const pt = camPos.clone().addScaledVector(dir, t);
            intersectionPts.push(pt);
          }
        }
      }
    }

    if (intersectionPts.length === 0) {
      return {
        minX: -2, maxX: 2, minZ: -2, maxZ: 2,
        height: captureHeight, centerX: 0, centerZ: 0, width: 4, depth: 4,
        points: []
      };
    }

    // Project points onto the plane just in case and find min/max
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const flat: THREE.Vector3[] = [];

    for (const p of intersectionPts) {
      const pFlat = p.clone();
      pFlat.y = 0; // ensure it's on ground
      flat.push(pFlat);
      minX = Math.min(minX, pFlat.x);
      maxX = Math.max(maxX, pFlat.x);
      minZ = Math.min(minZ, pFlat.z);
      maxZ = Math.max(maxZ, pFlat.z);
    }

    // Sort points angularly around center to create a clean boundary polygon
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const center = new THREE.Vector3(centerX, 0, centerZ);

    flat.sort((a, b) =>
      Math.atan2(a.z - center.z, a.x - center.x) -
      Math.atan2(b.z - center.z, b.x - center.x)
    );

    // Limit AABB to reasonable range
    const CLAMP = 15;
    minX = Math.max(minX, -CLAMP); maxX = Math.min(maxX, CLAMP);
    minZ = Math.max(minZ, -CLAMP); maxZ = Math.min(maxZ, CLAMP);

    return {
      minX, maxX, minZ, maxZ,
      height: captureHeight,
      centerX, centerZ,
      width: Math.min(maxX - minX, CLAMP * 2),
      depth: Math.min(maxZ - minZ, CLAMP * 2),
      points: flat
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
    watch(showFrustums, (val) => {
      syncVisibility(val);
    });
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
