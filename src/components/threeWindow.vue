<template>
  <section class="scene" ref="sceneRef"></section>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; 
import { useIris } from '@/lib/useIris';
import { useSceneCameras } from '@/lib/useSceneCameras'; 
 
const showPlaySpace = ref(true);
const showCameras = ref(true);

const { cameras: irisCameras, isRunning, lastFrame: irisData } = useIris({ autoFetch: true, pollInterval: 5000 });
const selectedCameraCount = computed(() => irisCameras.value.length);

const { addToScene: addSceneCameras, clearSceneContent } = useSceneCameras(selectedCameraCount, showCameras, showCameras);


const sceneRef = ref<HTMLElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null; 
let grid: THREE.GridHelper | null = null;
let hemi: THREE.HemisphereLight | null = null;
let themeObserver: MutationObserver | null = null;
let animationFrameId: number | null = null;
let hasLoadedIrisScene = false;
let isLoadingIrisScene = false;

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

let spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null = null;
let skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null  = null;
const position = new THREE.Object3D()
  

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
    hasLoadedIrisScene = false
    isLoadingIrisScene = false
    clearSceneContent()

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

async function loadIrisSceneOnce() {
  if (!scene || !isRunning.value || !irisData.value || hasLoadedIrisScene || isLoadingIrisScene) {
    return
  }

  isLoadingIrisScene = true

  try {
    await addSceneCameras(scene)
    hasLoadedIrisScene = true
  } catch (err) {
    console.warn('[threeWindow] unable to load IRIS extrinsics/scene data', err)
  } finally {
    isLoadingIrisScene = false
  }
}

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
  clearSceneContent();
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
 

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;

  watch(irisData, () => {
    void loadIrisSceneOnce()
  }, { immediate: true })
 
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
 
function renderIRISdata(poseInfo: IrisData) {
  try {
    poseInfo.people.forEach((person, i) => {
      
      if (!(spheresMesh && skeletonLine)) {
        const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff})
        spheresMesh = new THREE.InstancedMesh(sphereGeometry, material, (person.joint_centers.length))
        scene.add(spheresMesh)

        const lMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
        const lGeometry = new THREE.BufferGeometry()
        lGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))

        skeletonLine = new THREE.LineSegments(lGeometry, lMaterial)
        scene.add(skeletonLine)
      }
      const positionAttr = skeletonLine.geometry.attributes.position
      let idx = 0

      person.joint_centers.forEach((points, i) => {
        // Changed to X, Y, Z (0, 1, 2)
        position.position.set(points[0], points[1], points[2])
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i, position.matrix)
      })
      
      person.joint_centers.forEach((points, i) => {
        // Changed to X, Y, Z (0, 1, 2)
        position.position.set(points[0], points[1], points[2])
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i + 3, position.matrix)
      })

      halpe26_pairs.forEach(([a, b]) => {
        const pos1 = person.joint_centers[a]
        const pos2 = person.joint_centers[b]

        // Changed to X, Y, Z mapping for position 1
        positionAttr.array[idx++] = pos1[0]
        positionAttr.array[idx++] = pos1[1]
        positionAttr.array[idx++] = pos1[2]

        // Changed to X, Y, Z mapping for position 2
        positionAttr.array[idx++] = pos2[0]
        positionAttr.array[idx++] = pos2[1]
        positionAttr.array[idx++] = pos2[2]
      })

      positionAttr.needsUpdate = true
      spheresMesh.instanceMatrix.needsUpdate = true
 
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
