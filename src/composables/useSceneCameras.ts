import { ref, watch, type Ref } from 'vue';
import * as THREE from 'three';

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
  visible: boolean;
}

export interface PlaySpaceBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number; // suggested capture height
  centerX: number; centerZ: number;
  width: number; depth: number;
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

  const tl: [number, number, number] = [-hw,  hh, fd];
  const tr: [number, number, number] = [ hw,  hh, fd];
  const br: [number, number, number] = [ hw, -hh, fd];
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

  const gap   = s * 0.08;
  const triH  = s * 0.3;
  const triW  = s * 0.25;
  const triY  = hh + gap;

  const triVerts = new Float32Array([
    -triW, triY,        fd,
     triW, triY,        fd,
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

export function useSceneCameras(selectedCount?: Ref<number>) {
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

    // Try loading live extrinsics from the IRIS calibration file via IPC
    try {
      const extrinsics = await window.ipc?.getExtrinsics();
      isMockExtrinsics = extrinsics?._isMock === true;
      if (extrinsics?.cameras?.length) {
        // Determine unit scale to convert to metres for Three.js
        const unit = (extrinsics.unit_of_measurement ?? 'm').replace(/[^a-z]/gi, '').toLowerCase();
        const scale = unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : 1;
        defs = extrinsics.cameras
          .filter((c: any) => c.success !== false)
          .map((c: any, i: number) => extrinsicsToDef(c, i, scale));
        console.log(`[cameras] loaded ${defs.length} cameras from extrinsics (mock=${isMockExtrinsics}, unit=${unit}, scale=${scale})`);
      }
    } catch (err) {
      console.warn('[cameras] failed to load extrinsics, no cameras added', err);
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

      scene.add(cam);
      scene.add(gizmoMesh);

      sceneCameras.value.push({
        name: def.name,
        color: def.color,
        camera: cam,
        gizmoMesh,
        visible: false,
      });
    }

    syncVisibility();
  }

  /** Show all cameras in mock mode; otherwise show only the first N matching selected physical cameras. */
  function syncVisibility() {
    const count = selectedCount?.value ?? 0;
    const showAll = isMockExtrinsics && count === 0;
    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = showAll || i < count;
      sceneCameras.value[i].gizmoMesh.visible = show;
      sceneCameras.value[i].visible = show;
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
      return { minX: -2, maxX: 2, minZ: -2, maxZ: 2, height: captureHeight, centerX: 0, centerZ: 0, width: 4, depth: 4 };
    }

    // For each camera compute the convex footprint on Y=0 by projecting the
    // four bottom frustum corners (at the far plane) down onto the floor.
    const footprints: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

    for (const entry of visibleCams) {
      const cam = entry.camera;
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();

      // NDC corners at far plane (z = 1 in NDC)
      const ndcCorners = [
        new THREE.Vector3(-1, -1, 1),
        new THREE.Vector3( 1, -1, 1),
        new THREE.Vector3( 1,  1, 1),
        new THREE.Vector3(-1,  1, 1),
        // also mid-near to anchor the near end
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3( 1, -1, -1),
        new THREE.Vector3( 1,  1, -1),
        new THREE.Vector3(-1,  1, -1),
      ];

      const worldCorners = ndcCorners.map(v => v.unproject(cam));

      // For each edge from camera position → far-plane corner, intersect with Y=0
      const camPos = cam.position;
      const floorPoints: THREE.Vector3[] = [];

      for (const wc of worldCorners) {
        const dir = wc.clone().sub(camPos);
        // Ray: P = camPos + t*dir,  solve for P.y = 0
        if (Math.abs(dir.y) > 1e-6) {
          const t = -camPos.y / dir.y;
          if (t > 0) {
            floorPoints.push(camPos.clone().addScaledVector(dir, t));
          }
        }
        // If the corner itself is already near the floor include it
        if (Math.abs(wc.y) < 0.5) floorPoints.push(wc.clone());
      }

      // Also include the camera position projected to floor (covers overhead cams)
      floorPoints.push(new THREE.Vector3(camPos.x, 0, camPos.z));

      if (floorPoints.length === 0) continue;

      const fp = {
        minX: Infinity, maxX: -Infinity,
        minZ: Infinity, maxZ: -Infinity,
      };
      for (const p of floorPoints) {
        fp.minX = Math.min(fp.minX, p.x);
        fp.maxX = Math.max(fp.maxX, p.x);
        fp.minZ = Math.min(fp.minZ, p.z);
        fp.maxZ = Math.max(fp.maxZ, p.z);
      }
      footprints.push(fp);
    }

    // Intersect all footprints
    let minX = footprints[0].minX;
    let maxX = footprints[0].maxX;
    let minZ = footprints[0].minZ;
    let maxZ = footprints[0].maxZ;

    for (let i = 1; i < footprints.length; i++) {
      minX = Math.max(minX, footprints[i].minX);
      maxX = Math.min(maxX, footprints[i].maxX);
      minZ = Math.max(minZ, footprints[i].minZ);
      maxZ = Math.min(maxZ, footprints[i].maxZ);
    }

    // If the intersection is degenerate fall back to union
    if (minX >= maxX || minZ >= maxZ) {
      minX = Math.min(...footprints.map(f => f.minX));
      maxX = Math.max(...footprints.map(f => f.maxX));
      minZ = Math.min(...footprints.map(f => f.minZ));
      maxZ = Math.max(...footprints.map(f => f.maxZ));
    }

    // Clamp to a sensible range
    const CLAMP = 20;
    minX = Math.max(minX, -CLAMP); maxX = Math.min(maxX, CLAMP);
    minZ = Math.max(minZ, -CLAMP); maxZ = Math.min(maxZ, CLAMP);

    return {
      minX, maxX, minZ, maxZ,
      height: captureHeight,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX,
      depth: maxZ - minZ,
    };
  }

  /** Remove all scene camera objects and clear the list. */
  function clearSceneCameras() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
      });
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

  function dispose() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          ((child as THREE.Mesh).material as THREE.Material).dispose();
        }
      });
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
