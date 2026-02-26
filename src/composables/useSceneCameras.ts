import { ref, watch, type Ref } from 'vue';
import * as THREE from 'three';
import cameraConfig from '@/assets/cameraPositions.json';

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
  /** Small pyramid mesh pointing in the lookAt direction (Blender-style) */
  pyramidMesh: THREE.Mesh;
  visible: boolean;
}

const PYRAMID_SIZE = 0.25; // height of the small pyramid

/**
 * Build a small cone (pyramid) mesh oriented so that its flat base
 * faces the lookAt target — like Blender's camera gizmo.
 */
function createCameraPyramid(
  position: { x: number; y: number; z: number },
  lookAt: { x: number; y: number; z: number },
  color: string,
): THREE.Mesh {
  // ConeGeometry with 4 radial segments → pyramid shape
  const geo = new THREE.ConeGeometry(PYRAMID_SIZE * 0.6, PYRAMID_SIZE, 4);
  // Default cone points along +Y. Rotate so the tip points along +Z
  // (away from camera forward). After lookAt, the flat base will face the target.
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    wireframe: true,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);

  // Point the mesh at the lookAt target — flat base now faces that direction
  mesh.lookAt(lookAt.x, lookAt.y, lookAt.z);

  return mesh;
}

export function useSceneCameras(selectedCount?: Ref<number>) {
  const sceneCameras = ref<SceneCameraEntry[]>([]);
  let attachedScene: THREE.Scene | null = null;

  /**
   * Create cameras from JSON config and add them (plus pyramid meshes) to the scene.
   * All start hidden — visibility syncs with selectedCount.
   */
  function addToScene(scene: THREE.Scene) {
    attachedScene = scene;
    const defs = (cameraConfig.staticCameras ?? []) as SceneCameraDef[];

    for (const def of defs) {
      const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
      cam.position.set(def.position.x, def.position.y, def.position.z);
      cam.lookAt(def.lookAt.x, def.lookAt.y, def.lookAt.z);
      cam.name = def.name;
      cam.updateProjectionMatrix();

      const pyramidMesh = createCameraPyramid(def.position, def.lookAt, def.color);
      pyramidMesh.name = `${def.name}_pyramid`;
      pyramidMesh.visible = false; // hidden until synced

      scene.add(cam);
      scene.add(pyramidMesh);

      sceneCameras.value.push({
        name: def.name,
        color: def.color,
        camera: cam,
        pyramidMesh,
        visible: false,
      });
    }

    // Initial sync
    syncVisibility();
  }

  /** Show only the first N scene cameras, where N = selected physical camera count. */
  function syncVisibility() {
    const count = selectedCount?.value ?? 0;
    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = i < count;
      sceneCameras.value[i].pyramidMesh.visible = show;
      sceneCameras.value[i].visible = show;
    }
  }

  // Watch the selected count and re-sync automatically
  if (selectedCount) {
    watch(selectedCount, () => syncVisibility());
  }

  /** Remove all scene cameras and pyramid meshes from the scene. */
  function dispose() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.pyramidMesh);
      attachedScene?.remove(entry.camera);
      (entry.pyramidMesh.geometry as THREE.BufferGeometry).dispose();
      ((entry.pyramidMesh.material as THREE.Material)).dispose();
    }
    sceneCameras.value = [];
    attachedScene = null;
  }

  return {
    sceneCameras,
    addToScene,
    syncVisibility,
    dispose,
  } as const;
}
