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
    const { polygons } = bounds;

    const group = new THREE.Group();
    group.position.set(0, 0.005, 0); // Tiny offset to prevent grid flickering

    if (polygons && polygons.length > 0) {
      // 1. Floor Infill (Separate mesh per island to avoid triangulation artifacts)
      const floorMat = new THREE.MeshBasicMaterial({
        color: 0x00f2ff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      polygons.forEach(poly => {
        if (poly.length < 3) return;
        const shape = new THREE.Shape();
        shape.moveTo(poly[0].x, poly[0].z);
        for (let i = 1; i < poly.length; i++) {
          shape.lineTo(poly[i].x, poly[i].z);
        }
        shape.closePath();

        const floorGeo = new THREE.ShapeGeometry(shape);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = Math.PI / 2;
        group.add(floor);
      });

      // 2. Outline boundary
      const outlinePoints: THREE.Vector3[] = [];
      polygons.forEach(poly => {
        if (poly.length < 3) return;
        for (let i = 0; i < poly.length; i++) {
          outlinePoints.push(poly[i]);
          outlinePoints.push(poly[(i + 1) % poly.length]);
        }
      });

      if (outlinePoints.length > 0) {
        const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const outlineMat = new THREE.LineBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.8,
          linewidth: 2
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

