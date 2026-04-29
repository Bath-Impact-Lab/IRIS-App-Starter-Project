<template>
  <section class="scene" ref="sceneRef"></section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/Addons.js';
import { useCameraStore } from '../stores/useCameraStore';
import { useIrisStore } from '../stores/useIrisStore';
import { useSceneCameras } from '../lib/useSceneCameras';
import { usePlaySpace } from '../lib/usePlaySpace';

const { selectedCameraCount } = useCameraStore();
const { irisData, running, selectedAvatar } = useIrisStore();
const { addToScene: addSceneCameras } = useSceneCameras();
const { create: createPlaySpace, rebuild: rebuildPlaySpace } = usePlaySpace();

const sceneRef = ref<HTMLElement | null>(null);
const IrisState = useIrisStore()


let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null;
let modelsRoot: THREE.Object3D[] | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
let animationFrame = 0;

const activeBones: Record<string, THREE.Object3D> = {};
const boneBindQuats: Record<string, THREE.Quaternion> = {};
let bindPelvisWorldOffset: THREE.Vector3 | null = null;

let spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null = null;
let skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null = null;
const position = new THREE.Object3D();

const manager = new THREE.LoadingManager();

const halpe26Pairs = [
  [0, 1], [0, 2], [1, 3], [2, 4],
  [17, 18], [18, 5], [18, 6],
  [5, 7], [7, 9],
  [6, 8], [8, 10],
  [5, 6],
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [18, 19], [19, 11], [19, 12],
  [15, 20], [15, 22], [15, 24],
  [16, 21], [16, 23], [16, 25],
] as const;

const linePositions = new Float32Array(halpe26Pairs.length * 3 * 2);

watch(running, (value) => {
  if (value) return;

  if (skeletonLine) {
    skeletonLine.removeFromParent();
    skeletonLine = null;
  }
  if (spheresMesh) {
    spheresMesh.removeFromParent();
    spheresMesh = null;
  }
});

function clearModel() {
  if (!scene || !modelsRoot) return;

  modelsRoot.forEach((root) => {
    scene.remove(root);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        Array.isArray(mesh.material)
          ? mesh.material.forEach((material) => material.dispose())
          : mesh.material.dispose();
      }
    });
  });

  modelsRoot = null;
  skeletonHelper?.removeFromParent();
  skeletonHelper = null;
}
const irisStarted = ref(false)

onMounted(() => {
  if (sceneRef.value) initThree(sceneRef.value);
  if (resizeObserver && sceneRef.value) resizeObserver.unobserve(sceneRef.value);
})

window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
      if (renderer) {
        renderer.setSize( window.innerWidth, window.innerHeight );
      }
})

function collectBonesFromSkinnedMesh(root: THREE.Object3D) {
  const leftShoulder = root.getObjectByName('mixamorigLeftShoulder');
  const rightShoulder = root.getObjectByName('mixamorigRightShoulder');
  const spine = root.getObjectByName('mixamorigSpine');
  const leftElbow = root.getObjectByName('mixamorigLeftArm');
  const rightElbow = root.getObjectByName('mixamorigRightArm');
  const leftHip = root.getObjectByName('mixamorigLeftUpLeg');
  const rightHip = root.getObjectByName('mixamorigRightUpLeg');
  const leftKnee = root.getObjectByName('mixamorigLeftLeg');
  const rightKnee = root.getObjectByName('mixamorigRightLeg');
  const pelvis = root.getObjectByName('mixamorigHips');

  activeBones.shoulder_l = leftShoulder as THREE.Object3D;
  activeBones.shoulder_r = rightShoulder as THREE.Object3D;
  activeBones.spine = spine as THREE.Object3D;
  activeBones.elbow_l = leftElbow as THREE.Object3D;
  activeBones.elbow_r = rightElbow as THREE.Object3D;
  activeBones.hip_l = leftHip as THREE.Object3D;
  activeBones.hip_r = rightHip as THREE.Object3D;
  activeBones.knee_l = leftKnee as THREE.Object3D;
  activeBones.knee_r = rightKnee as THREE.Object3D;
  activeBones.pelvis = pelvis as THREE.Object3D;

  if (pelvis) {
    bindPelvisWorldOffset = new THREE.Vector3();
    pelvis.getWorldPosition(bindPelvisWorldOffset);
  }

  for (const key in activeBones) {
    if (activeBones[key]) {
      boneBindQuats[key] = activeBones[key].quaternion.clone();
    }
  }

  skeletonHelper = new THREE.SkeletonHelper(root);
  scene.add(skeletonHelper);
}

async function loadModel(targetScene: THREE.Scene, file: string) {
  clearModel();
  const loader = new FBXLoader(manager);

  try {
    loader.load(`assets/${file}`, (group) => {
      if (modelsRoot) {
        modelsRoot.push(group);
      } else {
        modelsRoot = [group];
      }

      const modelRoot = modelsRoot[modelsRoot.length - 1];
      modelRoot.castShadow = true;
      modelRoot.receiveShadow = true;
      modelRoot.scale.set(0.01, 0.01, 0.01);
      targetScene.add(modelRoot);
      modelRoot.updateMatrixWorld(true);

      collectBonesFromSkinnedMesh(modelRoot);
    });
  } catch (err) {
    console.log('error loading file');
    console.log(err);
  }
}

async function initThree(container: HTMLElement) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor('#0b0f14');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);
  camera.position.set(5, 5, 5);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2, 3, 2);
  dir.castShadow = true;
  scene.add(dir);

  const grid = new THREE.GridHelper(10, 20, 0x2a3340, 0x1b2430);
  scene.add(grid);

  // Load the mesh so it exists in the scene
  // loadModel(scene, "Idle.fbx");



  watch(selectedCameraCount, () => {
    void nextTick(() => rebuildPlaySpace());
  });

  watch(selectedAvatar, (value) => {
    if (!scene) return;
    void loadModel(scene, value ?? 'Idle.fbx');
  });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;


  // Add scene cameras from extrinsics
  watch(() => irisStarted.value, (running) => {
    if (window.ipc?.getExtrinsics() && running) {
      props.addSceneCameras(scene)
      console.log("extrinsics")
    }
    else if (!running) {
      console.log("dispose")
      props.disposeCameras()
    }
  })

watch(() => IrisState.running, (running) => {
  if (!running) {
    if (skeletonLine) {
      skeletonLine.forEach((skeleton) => skeleton.removeFromParent())
      skeletonLine = []
    }
    if (spheresMesh) {
      spheresMesh.forEach((spheres) => spheres.removeFromParent())
      spheresMesh = []
    }
    
  }
})

watch(() => props.irisData, (data) => {
  if (data) {
    irisStarted.value = true
  }
  else {
    irisStarted.value = false
  }
})

  // Build play space from loaded camera frustums
  props.createPlaySpace(scene);

  const fps = 30;
  const frameDuration = 1000 / fps;

  let lastTime = 0;
  let currentFrame = 0;

  const animate = (time: number) => {
    animationFrame = requestAnimationFrame(animate);

    if (irisData.value) {
      if (time - lastTime >= frameDuration && Array.isArray(irisData.value)) {
        renderIRISData(irisData.value[currentFrame]);
        currentFrame = (currentFrame + 1) % irisData.value.length;
        lastTime = time;
      } else if (!Array.isArray(irisData.value)) {
        renderIRISData(irisData.value);
      }
    }

    controls?.update();
    renderer?.render(scene, camera);
  };

  animate(lastTime);

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const nextWidth = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      renderer?.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    }
  });
  resizeObserver.observe(container);
}

const tmpParentWorldQuat = new THREE.Quaternion();
const tmpParentWorldQuatInv = new THREE.Quaternion();
const tmpBoneAxis = new THREE.Vector3(0, 1, 0);
const tmpTargetDirWorld = new THREE.Vector3();
const tmpDeltaLocal = new THREE.Quaternion();
const tmpTargetDirLocal = new THREE.Vector3();
const tmpBindDirLocal = new THREE.Vector3();

function alignBoneFromBindPose(
  boneKey: string,
  p1: [number, number, number],
  p2: [number, number, number],
) {
  const bone = activeBones[boneKey];
  const bindQuat = boneBindQuats[boneKey];
  if (!bone || !bindQuat || !bone.parent || !p1 || !p2) return;

  const worldStart = new THREE.Vector3(p1[0], p1[2], p1[1]);
  const worldEnd = new THREE.Vector3(p2[0], p2[2], p2[1]);
  tmpTargetDirWorld.subVectors(worldEnd, worldStart).normalize();

  if (tmpTargetDirWorld.lengthSq() < 1e-8) return;

  bone.parent.getWorldQuaternion(tmpParentWorldQuat);
  tmpParentWorldQuatInv.copy(tmpParentWorldQuat).invert();
  tmpTargetDirLocal.copy(tmpTargetDirWorld).applyQuaternion(tmpParentWorldQuatInv).normalize();
  tmpBindDirLocal.copy(tmpBoneAxis).applyQuaternion(bindQuat).normalize();
  tmpDeltaLocal.setFromUnitVectors(tmpBindDirLocal, tmpTargetDirLocal);
  bone.quaternion.copy(tmpDeltaLocal).multiply(bindQuat).normalize();
  bone.updateMatrixWorld(true);
}

function renderIRISData(poseInfo: IrisData) {
  // console.log(poseInfo)
  const scale = 4.5
  try {
    poseInfo.people.forEach((person, i) => {
      const neck = person.joint_centers[0]
      const pelvis = person.joint_centers[1]
      const spine_mid = person.joint_centers[2]
      const keypoints = [[neck[0], neck[1], neck[2]], [pelvis[0], pelvis[1], pelvis[2]], [spine_mid[0], spine_mid[1], spine_mid[2]]]
      if ((spheresMesh.length == 0 && skeletonLine.length == 0) || (spheresMesh.length < poseInfo.people.length && skeletonLine.length < poseInfo.people.length)) {
        const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff})
        spheresMesh.push(new THREE.InstancedMesh(sphereGeometry, material, (keypoints.length + person.joint_centers.length)))
        scene.add(spheresMesh[i])

        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

        skeletonLine.push(new THREE.LineSegments(lGeometry, lMaterial))
        scene.add(skeletonLine[i])
      }
      // console.log(poseInfo.people.length, scene)
      const positionAttr = skeletonLine[i].geometry.attributes.position
      let idx = 0

      keypoints.forEach((points, j) => {
        position.position.set(points[0] * scale, points[1] * scale, points[2] * scale)
        position.updateMatrix()
        spheresMesh[i].setMatrixAt(j, position.matrix)
      })
      person.joint_centers.forEach((points, j) => {
        position.position.set(points[0] * scale, points[1] * scale, points[2] * scale)
        position.updateMatrix()
        spheresMesh[i].setMatrixAt(j + 3, position.matrix)
      })

      halpe26Pairs.forEach(([a, b]) => {
        const pos1 = person.joint_centers[a];
        const pos2 = person.joint_centers[b];

        positionAttr.array[idx++] = pos1[0] * scale
        positionAttr.array[idx++] = pos1[1] * scale
        positionAttr.array[idx++] = pos1[2] * scale

        positionAttr.array[idx++] = pos2[0] * scale
        positionAttr.array[idx++] = pos2[1] * scale
        positionAttr.array[idx++] = pos2[2] * scale
      })

      positionAttr.needsUpdate = true
      spheresMesh[i].instanceMatrix.needsUpdate = true

      if (person.joint_centers && person.joint_centers.length >= 26) {
        // 1. MOVE THE ENTIRE MODEL TO THE TRACKED ROOT
        // We apply this to the parent group to respect your 0.01 scale!
        if (modelsRoot && modelsRoot.length > 0) {
          const pelvisPos = person.joint_centers[19]; // Tracked Pelvis
          // Map OpenCV (X, Y, Z) to Three.js (X, Z, Y)
          const targetPelvis = new THREE.Vector3(pelvisPos[0], pelvisPos[1], pelvisPos[2]);
          if (bindPelvisWorldOffset) {
            modelsRoot[0].position.copy(targetPelvis).sub(bindPelvisWorldOffset);
          } else {
            modelsRoot[0].position.copy(targetPelvis);
          }
          const leftHipPos = person.joint_centers[11];
          const rightHipPos = person.joint_centers[12];

          // Map to Three.js coordinates
          const lHip = new THREE.Vector3(leftHipPos[0], leftHipPos[1], leftHipPos[2]);
          const rHip = new THREE.Vector3(rightHipPos[0], rightHipPos[1], rightHipPos[2]);

          // Get the directional vector from Right Hip to Left Hip
          const hipDir = new THREE.Vector3().subVectors(lHip, rHip);

          // Restrict to the XZ plane so the character doesn't tilt/lean over
          hipDir.y = 0;

        if (hipDir.lengthSq() > 1e-8) {
          hipDir.normalize();
          const defaultHipDir = new THREE.Vector3(-1, 0, 0);
          const rootRotation = new THREE.Quaternion().setFromUnitVectors(defaultHipDir, hipDir);
          modelsRoot[0].quaternion.copy(rootRotation);
        }

        alignBoneFromBindPose('spine', person.joint_centers[19], person.joint_centers[18]);
        alignBoneFromBindPose('shoulder_r', person.joint_centers[5], person.joint_centers[7]);
        alignBoneFromBindPose('elbow_r', person.joint_centers[7], person.joint_centers[9]);
        alignBoneFromBindPose('shoulder_l', person.joint_centers[6], person.joint_centers[8]);
        alignBoneFromBindPose('elbow_l', person.joint_centers[8], person.joint_centers[10]);
        alignBoneFromBindPose('hip_r', person.joint_centers[11], person.joint_centers[13]);
        alignBoneFromBindPose('knee_r', person.joint_centers[13], person.joint_centers[15]);
        alignBoneFromBindPose('hip_l', person.joint_centers[12], person.joint_centers[14]);
        alignBoneFromBindPose('knee_l', person.joint_centers[14], person.joint_centers[16]);

      }
    });
  } catch (err) {
    console.error('unable to pass the IRIS data', err);
  }
}

onMounted(() => {
  if (sceneRef.value) {
    void initThree(sceneRef.value);
  }
});

onBeforeUnmount(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  if (resizeObserver && sceneRef.value) {
    resizeObserver.unobserve(sceneRef.value);
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  controls?.dispose();
  controls = null;

  clearModel();

  if (spheresMesh) {
    scene?.remove(spheresMesh);
    spheresMesh.geometry.dispose();
    spheresMesh.material.dispose();
    spheresMesh = null;
  }

  if (skeletonLine) {
    scene?.remove(skeletonLine);
    skeletonLine.geometry.dispose();
    skeletonLine.material.dispose();
    skeletonLine = null;
  }

  renderer?.dispose();
  renderer = null;
});
</script>
