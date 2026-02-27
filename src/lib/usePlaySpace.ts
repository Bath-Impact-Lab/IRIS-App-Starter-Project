import { watch, type Ref } from 'vue';
import * as THREE from 'three';
import type { PlaySpaceBounds } from './useSceneCameras';

export function usePlaySpace(
  showPlaySpace: Ref<boolean>,
  computePlaySpaceBounds: () => PlaySpaceBounds,
) {
  let playSpaceGroup: THREE.Group | null = null;
  let attachedScene: THREE.Scene | null = null;

  function create(scene: THREE.Scene) {
    attachedScene = scene;

    // Remove old group if it exists
    if (playSpaceGroup) {
      scene.remove(playSpaceGroup);
      playSpaceGroup.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        const mat = (child as THREE.Mesh).material;
        if (mat) Array.isArray(mat) ? mat.forEach(m => m.dispose()) : (mat as THREE.Material).dispose();
      });
      playSpaceGroup = null;
    }

    const bounds = computePlaySpaceBounds();
    const { width, depth, height, centerX, centerZ } = bounds;

    const group = new THREE.Group();
    group.position.set(centerX, 0, centerZ);

    // Floor plane sized to the computed footprint
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // Boundary box edges sized to frustum intersection
    const boxGeo = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.6 });
    const boundaryBox = new THREE.LineSegments(edges, edgeMat);
    boundaryBox.position.y = height / 2;
    group.add(boundaryBox);

    // Corner pillars
    const pillarGeo = new THREE.CylinderGeometry(0.03, 0.03, height, 8);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.5 });
    const hw = width / 2;
    const hd = depth / 2;
    ([[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]] as [number, number][]).forEach(([x, z]) => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, height / 2, z);
      group.add(pillar);
    });

    group.visible = showPlaySpace.value;
    scene.add(group);
    playSpaceGroup = group;

    // Sync visibility with the ref
    watch(showPlaySpace, (val) => {
      if (playSpaceGroup) playSpaceGroup.visible = val;
    });
  }

  function rebuild() {
    if (attachedScene) create(attachedScene);
  }

  function dispose() {
    if (playSpaceGroup && attachedScene) {
      attachedScene.remove(playSpaceGroup);
      playSpaceGroup.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        const mat = (child as THREE.Mesh).material;
        if (mat) Array.isArray(mat) ? mat.forEach(m => m.dispose()) : (mat as THREE.Material).dispose();
      });
      playSpaceGroup = null;
    }
    attachedScene = null;
  }

  return { create, rebuild, dispose };
}

