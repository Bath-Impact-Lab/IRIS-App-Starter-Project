<template>
  <section class="scene" ref="sceneRef"></section>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/Addons.js';
import { useIris } from '@/lib/useIris';
import { useSceneCameras } from '@/lib/useSceneCameras';
import { usePlaySpace } from '@/lib/usePlaySpace';

//defining emits for future
const emit = defineEmits<{
  giveSphereMesh: [THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null]
  giveSkeletonMesh: [THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null]
}>()

const showPlaySpace = ref(true);
const showCameras = ref(true);

const { cameras: irisCameras, isRunning, lastFrame: irisData } = useIris({ autoFetch: true, pollInterval: 5000 });
const selectedCameraCount = computed(() => irisCameras.value.length);

const { addToScene: addSceneCameras, computePlaySpaceBounds } = useSceneCameras(selectedCameraCount, showCameras, showCameras);
const { create: createPlaySpace, rebuild: rebuildPlaySpace } = usePlaySpace(showPlaySpace, computePlaySpaceBounds);

const sceneRef = ref<HTMLElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null;
let modelsRoot: THREE.Object3D[] | null = null;
let grid: THREE.GridHelper | null = null;
let hemi: THREE.HemisphereLight | null = null;
let themeObserver: MutationObserver | null = null;
let animationFrameId: number | null = null;

const DARK_BG  = '#0b0f14';
const LIGHT_BG = '#ddeef8';

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function applyThemeToScene() {
  if (!renderer) return;
  
  const isLight = isLightTheme();
  const bgColor = isLight ? LIGHT_BG : DARK_BG;
  
  renderer.setClearColor(bgColor);

  // Update Fog Color to match background
  if (scene && scene.fog) {
    (scene.fog as THREE.Fog).color.set(bgColor);
  }

  if (isLight) {
    if (grid) (grid.material as THREE.LineBasicMaterial).color.set(0x99ccee);
    if (hemi) { hemi.groundColor.set(0xddeef8); hemi.intensity = 1.2; }
  } else {
    if (grid) (grid.material as THREE.LineBasicMaterial).color.set(0x5a7a99);
    if (hemi) { hemi.groundColor.set(0x223344); hemi.intensity = 0.9; }
  }
}

function createAxisLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Universal visibility: white text with a black outline
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 64, 32);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 0.75, 1); // Adjust aspect ratio to match canvas
  
  return sprite;
}

// Store discovered bones to drive them with joint_angles
let activeBones: Record<string, THREE.Object3D> = {};
let boneBindQuats: Record<string, THREE.Quaternion> = {};
let bindPelvisWorldOffset: THREE.Vector3 | null = null;

let spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null = null;
let skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null  = null;
const position = new THREE.Object3D()

let avatarRoot: THREE.Object3D | null = null;

const manager = new THREE.LoadingManager();
let mixer: THREE.AnimationMixer[] | null;

const halpe26_pairs = [
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
  [16, 21], [16, 23], [16, 25]
]

const linePositions = new Float32Array(halpe26_pairs.length * 3 * 2)

watch(isRunning, (running) => {
  if (!running) {
    if (skeletonLine) {
      skeletonLine.removeFromParent()
      skeletonLine = null
    }
    if (spheresMesh) {
      spheresMesh.removeFromParent()
      spheresMesh = null
    }
    
  }
})

function resizeScene(width = sceneRef.value?.clientWidth ?? 0, height = sceneRef.value?.clientHeight ?? 0) {
  if (!renderer || !camera) return;
  if (width <= 0 || height <= 0) return;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function handleWindowResize() {
  resizeScene();
}

onMounted(() => {
  if (sceneRef.value) initThree(sceneRef.value);
  window.addEventListener('resize', handleWindowResize);
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  controls?.dispose();
  controls = null;
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
})

async function loadModel(scene: THREE.Scene, type: string) {
  const loader = new FBXLoader(manager);
  const file = `assets/${type}`

  try {
    loader.load(file, function (group) {
      if (modelsRoot) {
        modelsRoot.push(group)
      }
      else {
        modelsRoot = [group]
      }
      const modelRoot = modelsRoot[modelsRoot.length - 1]
      modelRoot.castShadow = true
      modelRoot.receiveShadow = true
      modelRoot.scale.set(0.01, 0.01, 0.01)
      scene.add(modelRoot)
      modelRoot.updateMatrixWorld(true)

      collectBonesFromSkinnedMesh(modelRoot)

    })
  }
  catch (err) {
    console.log("error loading file")
    console.log(err)
  }
}

async function initThree(container: HTMLElement) {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene(); 
  
  // 1. ADD FOG
  // Using linear fog: color, near distance, far distance
  scene.fog = new THREE.Fog(isLightTheme() ? LIGHT_BG : DARK_BG, 5, 20);

  camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);
  camera.position.set(5, 5, 5);
  resizeScene(width, height);

  hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9); 
  dir.position.set(2, 3, 2); 
  dir.castShadow = true; 
  scene.add(dir);

  // 2. PALER GRID
  grid = new THREE.GridHelper(100, 200, 0x5a7a99, 0x3d5a73); 
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.2; 
  scene.add(grid);

  // 3. ADD AXIS LABELS
  // Placed slightly outside the 10x10 grid (which goes from -5 to 5)
  const labelX = createAxisLabelSprite('+X');
  labelX.position.set(5.5, 0, 0);
  scene.add(labelX);

  const labelMinusX = createAxisLabelSprite('-X');
  labelMinusX.position.set(-5.5, 0, 0);
  scene.add(labelMinusX);

  const labelZ = createAxisLabelSprite('+Z');
  labelZ.position.set(0, 0, 5.5);
  scene.add(labelZ);

  const labelMinusZ = createAxisLabelSprite('-Z');
  labelMinusZ.position.set(0, 0, -5.5);
  scene.add(labelMinusZ);

  // Apply theme immediately and watch for future changes
  applyThemeToScene();
  themeObserver = new MutationObserver(() => applyThemeToScene());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Load the mesh so it exists in the scene
  loadModel(scene, "Idle.fbx");


  watch(selectedCameraCount, () => { nextTick(() => rebuildPlaySpace()); });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;


  // Add scene cameras from extrinsics
  watch(isRunning, (running) => {
    if (running && window.ipc?.getExtrinsics()) addSceneCameras(scene);
  })

  // Build play space from loaded camera frustums
  createPlaySpace(scene);

  //if using a positions json
  const fps = 30
  const frameDuration = 1000 / fps

  let lastTime = 0
  let currentFrame = 0
  const animate = (time: number) => {
    animationFrameId = requestAnimationFrame(animate)

    if (irisData.value) {
      //used for data from position json file
      if (time - lastTime >= frameDuration && Array.isArray(irisData.value)) {
        renderIRISdata(irisData.value[currentFrame])

        currentFrame = (currentFrame + 1) % irisData.value.length
        lastTime = time
      }
      //used for live data
      else if (!Array.isArray(irisData.value)) {
        renderIRISdata(irisData.value)
      }
    }
    controls?.update()
    renderer?.render(scene, camera)
  };
  animationFrameId = requestAnimationFrame(animate)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        resizeScene(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(container);
  }
}

const tmpParentWorldQuat = new THREE.Quaternion();
const tmpParentWorldQuatInv = new THREE.Quaternion();
const tmpBoneAxis = new THREE.Vector3(0, 1, 0); // Mixamo bones typically point along Y 
const tmpTargetDirWorld = new THREE.Vector3();
const tmpDeltaLocal = new THREE.Quaternion();
const tmpTargetDirLocal = new THREE.Vector3();
const tmpBindDirLocal = new THREE.Vector3();

function alignBoneFromBindPose(
  boneKey: string,
  p1: [number, number, number],
  p2: [number, number, number]
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

function renderIRISdata(poseInfo: IrisData) {
  try {
    poseInfo.people.forEach((person, i) => {
      const neck = person.joint_centers[0]
      const pelvis = person.joint_centers[1]
      const spine_mid = person.joint_centers[2]
      const keypoints = [[neck[0], neck[1], neck[2]], [pelvis[0], pelvis[1], pelvis[2]], [spine_mid[0], spine_mid[1], spine_mid[2]]]
      if (!(spheresMesh && skeletonLine)) {
        const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff})
        spheresMesh = new THREE.InstancedMesh(sphereGeometry, material, (keypoints.length + person.joint_centers.length))
        scene.add(spheresMesh)

        const lMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
        const lGeometry = new THREE.BufferGeometry()
        lGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))

        skeletonLine = new THREE.LineSegments(lGeometry, lMaterial)
        scene.add(skeletonLine)
      }
      const positionAttr = skeletonLine.geometry.attributes.position
      let idx = 0

      keypoints.forEach((points, i) => {
        position.position.set(points[0], points[2], points[1])
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i, position.matrix)
      })
      person.joint_centers.forEach((points, i) => {
        position.position.set(points[0], points[2], points[1])
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i + 3, position.matrix)
      })

      halpe26_pairs.forEach(([a, b]) => {
        const pos1 = person.joint_centers[a]
        const pos2 = person.joint_centers[b]

        positionAttr.array[idx++] = pos1[0]
        positionAttr.array[idx++] = pos1[2]
        positionAttr.array[idx++] = pos1[1]

        positionAttr.array[idx++] = pos2[0]
        positionAttr.array[idx++] = pos2[2]
        positionAttr.array[idx++] = pos2[1]
      })

      positionAttr.needsUpdate = true
      spheresMesh.instanceMatrix.needsUpdate = true

      if (person.joint_centers && person.joint_centers.length >= 26) {
        // 1. MOVE THE ENTIRE MODEL TO THE TRACKED ROOT
        // We apply this to the parent group to respect your 0.01 scale!
        if (modelsRoot && modelsRoot.length > 0) {
          const pelvisPos = person.joint_centers[19]; // Tracked Pelvis
          // Map OpenCV (X, Y, Z) to Three.js (X, Z, Y)
          const targetPelvis = new THREE.Vector3(pelvisPos[0], pelvisPos[2], pelvisPos[1]);
          if (bindPelvisWorldOffset) {
            modelsRoot[0].position.copy(targetPelvis).sub(bindPelvisWorldOffset);
          } else {
            modelsRoot[0].position.copy(targetPelvis);
          }
          const leftHipPos = person.joint_centers[11];
          const rightHipPos = person.joint_centers[12];

          // Map to Three.js coordinates
          const lHip = new THREE.Vector3(leftHipPos[0], leftHipPos[2], leftHipPos[1]);
          const rHip = new THREE.Vector3(rightHipPos[0], rightHipPos[2], rightHipPos[1]);

          // Get the directional vector from Right Hip to Left Hip
          const hipDir = new THREE.Vector3().subVectors(lHip, rHip);

          // Restrict to the XZ plane so the character doesn't tilt/lean over
          hipDir.y = 0;

          if (hipDir.lengthSq() > 1e-8) {
            hipDir.normalize();

            // Default Right-to-Left vector. 
            // (Mixamo models usually face +Z, so Right to Left points to +X)
            const defaultHipDir = new THREE.Vector3(-1, 0, 0);

            const rootRotation = new THREE.Quaternion().setFromUnitVectors(defaultHipDir, hipDir);
            modelsRoot[0].quaternion.copy(rootRotation);
          }
        }

        // Torso (Pelvis -> Neck)
        alignBoneFromBindPose('spine', person.joint_centers[19], person.joint_centers[18]);

        // Right Arm (Shoulder -> Elbow, Elbow -> Wrist)
        alignBoneFromBindPose('shoulder_r', person.joint_centers[5], person.joint_centers[7]);
        alignBoneFromBindPose('elbow_r', person.joint_centers[7], person.joint_centers[9]);

        // Left Arm (Shoulder -> Elbow, Elbow -> Wrist)
        alignBoneFromBindPose('shoulder_l', person.joint_centers[6], person.joint_centers[8]);
        alignBoneFromBindPose('elbow_l', person.joint_centers[8], person.joint_centers[10]);

        // Right Leg (Hip -> Knee, Knee -> Ankle)
        alignBoneFromBindPose('hip_r', person.joint_centers[11], person.joint_centers[13]);
        alignBoneFromBindPose('knee_r', person.joint_centers[13], person.joint_centers[15]);

        // Left Leg (Hip -> Knee, Knee -> Ankle)
        alignBoneFromBindPose('hip_l', person.joint_centers[12], person.joint_centers[14]);
        alignBoneFromBindPose('knee_l', person.joint_centers[14], person.joint_centers[16]);

        skeletonHelper?.update();
      }
    })
  }
  catch (err) {
    console.error("unable to pass the IRIS data", err)
  }
}

</script>

<style scoped>
.scene-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.scene-overlay :deep(*) {
  pointer-events: auto;
}
</style>