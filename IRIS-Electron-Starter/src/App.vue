<template>
  <div>
    <nav class="navbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="split" ref="splitRef"><span>I</span><span>R</span><span>I</span><span>S</span>&nbsp;Starter</div>
      </div>
      <div class="menu">
        <div class="dropdown" :class="{ open: openMenu }">
          <button class="btn" @click="toggleMenu">Camera Selection</button>
          <div class="dropdown-menu">
            <h4>Detected cameras</h4>
            <div v-if="devices.length === 0" class="device">
              <div>
                <div>No cameras found</div>
                <small>We use a safe mock for now.</small>
              </div>
            </div>
            <div v-for="d in devices" :key="d.deviceId" class="device" @click="selectDevice(d)">
              <div>
                <div>{{ d.label || 'Camera ' + d.deviceId.substring(0,6) }}</div>
                <small>{{ d.kind }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
    <section class="scene" ref="sceneRef"></section>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { COCO_KEYPOINTS, COCO_EDGES, MockPoseStream, type PoseFrame } from './pose';

const sceneRef = ref<HTMLElement | null>(null);
const splitRef = ref<HTMLElement | null>(null);
const openMenu = ref(false);
const devices = ref<MediaDeviceInfo[]>([]);
// Skeleton always visible by default

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let frameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null;
let jointSpheres: THREE.Mesh[] = [];
let boneLines: THREE.LineSegments | null = null;
let poseStream: MockPoseStream | null = null;

function toggleMenu() { openMenu.value = !openMenu.value; }
function closeMenu() { openMenu.value = false; }
function onClickOutside(e: MouseEvent) {
  if (!openMenu.value) return;
  const dd = (e.target as HTMLElement)?.closest('.dropdown');
  if (!dd) closeMenu();
}

async function enumerateCameras() {
  try {
    // Trigger permission prompt to obtain labels
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
    const list = await navigator.mediaDevices.enumerateDevices();
    devices.value = list.filter(d => d.kind === 'videoinput');
  } catch (err) {
    // Mock when not available (e.g., permissions denied)
    devices.value = [{
      deviceId: 'mock-0',
      groupId: 'mock',
      kind: 'videoinput',
      label: 'Mock IRIS Camera',
      toJSON(){ return this as any }
    } as any];
  }
}

function selectDevice(d: MediaDeviceInfo){
  closeMenu();
  // For now, just log and maybe change background color subtly to show selection
  console.log('Selected device', d);
  if (renderer) {
    const col = new THREE.Color(0x0b0f14).offsetHSL(0.02, 0.05, 0.02);
    renderer.setClearColor(col, 1);
  }
  // Start mock pose stream when a camera is chosen (until IRIS real stream is wired)
  startMockPose();
}

// Removed wireframe toggle to keep UI unchanged; skeleton remains visible

async function loadSMPLX(scene: THREE.Scene){
  const loader = new OBJLoader();
  const rel = 'assets/SMPLX_neutral.obj';
  // Try direct path (dev), then Electron resolve, then read content and parse
  const tryLoadPath = (url: string) => new Promise<THREE.Group>((resolve, reject) => loader.load(url, resolve, undefined, reject));
  try {
    const devUrl = rel; // Vite serves public/ at root in dev
    let obj: THREE.Group | null = null;
    try { obj = await tryLoadPath(devUrl); }
    catch {
      const assetPath = await (window as any).electronAPI?.resolveAsset?.(rel).catch(() => devUrl) ?? devUrl;
      try { obj = await tryLoadPath(assetPath); }
      catch {
        const text = await (window as any).electronAPI?.readAsset?.(rel);
        if (text) {
          // OBJLoader can parse from string via parse
          obj = loader.parse(text);
        }
      }
    }
    if (!obj) throw new Error('OBJ load failed');
    obj.traverse((child: any) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x8fb3ff, metalness: 0.15, roughness: 0.6 });
        child.castShadow = true; child.receiveShadow = true;
      }
    });
    obj.position.set(0, 0, 0);
    scene.add(obj);
    fitToObject(obj);
  } catch (e) {
    console.warn('Failed to load SMPLX OBJ, using fallback', e);
    const geo = new THREE.TorusKnotGeometry(0.6, 0.2, 200, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6be675, metalness: 0.4, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    fitToObject(mesh);
  }
}

function fitToObject(target: THREE.Object3D){
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI/180);
  let distance = (maxDim/2) / Math.tan(fov/2);
  distance *= 1.4; // padding

  const dir = new THREE.Vector3(0.8, 0.5, 1).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
  camera.near = distance/100;
  camera.far = distance*100;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  controls?.target.copy(center);
  controls?.update();
}

function initThree(container: HTMLElement){
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor('#0b0f14');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, width/height, 0.01, 1000);
  camera.position.set(1.8, 1.3, 2.4);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(2, 3, 2); dir.castShadow = true; scene.add(dir);

  const grid = new THREE.GridHelper(10, 20, 0x2a3340, 0x1b2430); scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;

  loadSMPLX(scene);

  // Skeleton geometry
  initSkeleton(scene);

  const clock = new THREE.Clock();
  const animate = () => {
    const t = clock.getElapsedTime();
    dir.position.x = Math.sin(t*0.5)*3; dir.position.z = Math.cos(t*0.5)*3;
    controls?.update();
    renderer!.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };
  animate();

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries){
      const w = entry.contentRect.width; const h = entry.contentRect.height;
      renderer!.setSize(w, h);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
  });
  resizeObserver.observe(container);
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  // Trigger split animation
  requestAnimationFrame(() => { splitRef.value?.classList.add('ready'); });

  if (sceneRef.value) initThree(sceneRef.value);
  enumerateCameras();
  startMockPose();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  if (frameId) cancelAnimationFrame(frameId);
  if (resizeObserver && sceneRef.value) resizeObserver.unobserve(sceneRef.value);
  if (renderer) { renderer.dispose(); renderer = null; }
  poseStream?.stop();
});

function initSkeleton(scene: THREE.Scene){
  // Joints
  const jointGeo = new THREE.SphereGeometry(0.02, 16, 16);
  const jointMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });
  jointSpheres = COCO_KEYPOINTS.map(() => new THREE.Mesh(jointGeo, jointMat.clone()));
  jointSpheres.forEach(m => { m.visible = true; scene.add(m); });

  // Bones
  const positions = new Float32Array(COCO_EDGES.length * 2 * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
  boneLines = new THREE.LineSegments(geom, mat);
  boneLines.visible = true;
  scene.add(boneLines);
}

function updateSkeleton(frame: PoseFrame){
  // Position joints
  for (let i=0; i<COCO_KEYPOINTS.length; i++){
    const p = frame.keypoints[i]?.position || [0,0,0];
    jointSpheres[i].position.set(p[0], p[1], p[2]);
  }
  // Update bones
  const posAttr = (boneLines!.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
  let idx = 0;
  for (const [a,b] of COCO_EDGES){
    const pa = frame.keypoints[a]?.position || [0,0,0];
    const pb = frame.keypoints[b]?.position || [0,0,0];
    posAttr.setXYZ(idx++, pa[0], pa[1], pa[2]);
    posAttr.setXYZ(idx++, pb[0], pb[1], pb[2]);
  }
  posAttr.needsUpdate = true;
}

function startMockPose(){
  poseStream?.stop();
  poseStream = new MockPoseStream();
  poseStream.subscribe(updateSkeleton);
  poseStream.start();
}
</script>
