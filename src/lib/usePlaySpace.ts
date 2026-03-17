import { watch } from 'vue';
import * as THREE from 'three';
import { useSceneCameras } from './useSceneCameras';
import { useUIStore } from '../stores/useUIStore';

function createPlaySpaceStore() {
  const { showPlaySpace } = useUIStore();
  const { computePlaySpaceBounds } = useSceneCameras();

  let playSpaceGroup: THREE.Group | null = null;
  let attachedScene: THREE.Scene | null = null;

  function disposeGroup(scene: THREE.Scene, group: THREE.Group) {
    scene.remove(group);
    group.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      const material = (child as THREE.Mesh).material;
      if (material) {
        Array.isArray(material)
          ? material.forEach((item) => item.dispose())
          : (material as THREE.Material).dispose();
      }
    });
  }

  watch(showPlaySpace, (value) => {
    if (playSpaceGroup) {
      playSpaceGroup.visible = value;
    }
  });

  function create(scene: THREE.Scene) {
    attachedScene = scene;

    if (playSpaceGroup) {
      disposeGroup(scene, playSpaceGroup);
      playSpaceGroup = null;
    }

    const bounds = computePlaySpaceBounds();
    const { polygons } = bounds;

    const group = new THREE.Group();
    group.position.set(0, 0.005, 0);

    if (polygons.length > 0) {
      const floorMat = new THREE.MeshBasicMaterial({
        color: 0x446677,
        transparent: false,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
      });

      polygons.forEach((poly) => {
        if (poly.length < 3) return;

        const shape = new THREE.Shape();
        shape.moveTo(poly[0].x, poly[0].z);
        for (let i = 1; i < poly.length; i += 1) {
          shape.lineTo(poly[i].x, poly[i].z);
        }
        shape.closePath();

        const floorGeo = new THREE.ShapeGeometry(shape);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = Math.PI / 2;
        group.add(floor);
      });

      const outlinePoints: THREE.Vector3[] = [];
      polygons.forEach((poly) => {
        if (poly.length < 3) return;
        for (let i = 0; i < poly.length; i += 1) {
          outlinePoints.push(poly[i]);
          outlinePoints.push(poly[(i + 1) % poly.length]);
        }
      });

      if (outlinePoints.length > 0) {
        const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const outlineMat = new THREE.LineBasicMaterial({
          color: 0x446677,
          transparent: true,
          opacity: 0.5,
          linewidth: 2,
        });
        const outline = new THREE.LineSegments(outlineGeo, outlineMat);
        group.add(outline);
      }

      group.visible = showPlaySpace.value;
    } else {
      group.visible = false;
    }

    scene.add(group);
    playSpaceGroup = group;
  }

  function rebuild() {
    if (attachedScene) {
      create(attachedScene);
    }
  }

  function dispose() {
    if (playSpaceGroup && attachedScene) {
      disposeGroup(attachedScene, playSpaceGroup);
      playSpaceGroup = null;
    }

    attachedScene = null;
  }

  return { create, rebuild, dispose };
}

let playSpaceStore: ReturnType<typeof createPlaySpaceStore> | null = null;

export function usePlaySpace() {
  if (!playSpaceStore) {
    playSpaceStore = createPlaySpaceStore();
  }

  return playSpaceStore;
}
