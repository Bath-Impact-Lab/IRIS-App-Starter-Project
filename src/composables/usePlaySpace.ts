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
    const { width, depth, height, centerX, centerZ, points } = bounds;

    const group = new THREE.Group();
    // Neutralize group position as we'll use world coordinates for the polygon
    // But pillars still benefit from a local offset if we want, 
    // actually it's easier to just keep group at 0,0,0 if points are world space
    group.position.set(0, 0, 0);

    if (points && points.length > 2) {
      // 1. Floor polygon
      const shape = new THREE.Shape();
      shape.moveTo(points[0].x, points[0].z);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
      }
      shape.closePath();

      const floorGeo = new THREE.ShapeGeometry(shape);
      const floorMat = new THREE.MeshBasicMaterial({
        color: 0x1a2a3a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = Math.PI / 2; // Flat on ground (X-Z plane is Y=0)
      // Note: ShapeGeometry is in XY plane by default, so we rotate it to XZ
      group.add(floor);

      // 2. Outline boundary
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const outlineMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, linewidth: 2 });
      const outline = new THREE.LineLoop(outlineGeo, outlineMat);
      group.add(outline);
    } else {
      // Fallback to simple plane if no points
      group.position.set(centerX, 0, centerZ);
      const floorGeo = new THREE.PlaneGeometry(width, depth);
      const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      group.add(floor);

      const outlineGeo = new THREE.EdgesGeometry(floorGeo);
      const outlineMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.6 });
      const outline = new THREE.LineSegments(outlineGeo, outlineMat);
      group.add(outline);
    }

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

