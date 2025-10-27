<template>
  <div>
    <nav class="navbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="split" ref="splitRef">{{ appTitle }}</div>
      </div>
      <div class="menu">
        <!-- Camera selection dropdown -->
        <div class="dropdown" :class="{ open: openCamera }">
          <button
            class="btn"
            ref="cameraButtonRef"
            @click="toggleCamera"
            @keydown="onCameraButtonKeydown"
            aria-haspopup="listbox"
            :aria-expanded="openCamera"
            aria-controls="camera-listbox"
          >
            {{ selectedDeviceLabel || 'Camera Selection' }}
          </button>
          <div
            class="dropdown-menu"
            id="camera-listbox"
            ref="cameraListRef"
            role="listbox"
            tabindex="0"
            :aria-activedescendant="activeCameraOptionId"
            @keydown="onCameraListKeydown"
          >
            <h4>Detected cameras</h4>
            <div v-if="devices.length === 0" class="device">
              <div>
                <div>No cameras found</div>
                <small>We use a safe mock for now.</small>
              </div>
            </div>
            <div
              v-for="(d, i) in devices"
              :key="d.deviceId"
              class="device"
              role="option"
              :id="'cam-opt-' + i"
              :aria-selected="i === cameraActiveIndex"
              :class="{ active: i === cameraActiveIndex }"
              @click="selectDevice(d)"
            >
              <div>
                <div>{{ d.label || 'Camera ' + d.deviceId.substring(0,6) }}</div>
                <small>{{ d.kind }}</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Tracking type dropdown -->
        <div class="dropdown" :class="{ open: openTrack }" style="margin-left: 12px;">
          <button class="btn" @click="toggleTrack">
            {{ trackingType || 'Tracking Type' }}
          </button>
          <div class="dropdown-menu">
            <h4>Tracking</h4>
            <div class="device" v-for="t in trackingOptions" :key="t" @click="selectTracking(t)">
              <div>
                <div>{{ t }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Output option dropdown -->
        <div class="dropdown" :class="{ open: openOutput }" style="margin-left: 12px;">
          <button class="btn" @click="toggleOutput">
            {{ outputOption || 'Output' }}
          </button>
          <div class="dropdown-menu">
            <h4>Output</h4>
            <div class="device" v-for="o in outputOptions" :key="o" @click="selectOutput(o)">
              <div>
                <div>{{ o }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side: sign-in area -->
      <div class="nav-right">
        <div class="menu-right">
          <button class="btn btn-signin" @click="toggleSignIn">{{ userSignedIn ? 'Signed in' : 'Sign in' }}</button>
        </div>
      </div>
    </nav>
    <section class="scene" ref="sceneRef"></section>
    <div class="hud">
      <label class="hud-item">
        <input type="checkbox" v-model="showModel" />
        <span>Show model</span>
      </label>
      <div class="hud-sep"></div>
      <div class="hud-item">
        <span :class="['dot', irisConnected ? 'ok' : 'warn']"></span>
        <span>{{ irisConnected ? 'IRIS connected' : 'IRIS offline' }}</span>
      </div>
      <div class="hud-sep" v-if="isDev"></div>
      <button class="btn btn-mini" v-if="isDev" @click="debugOpen = !debugOpen">{{ debugOpen ? 'Hide' : 'Show' }} debug</button>
    </div>

    <div class="debug" v-if="isDev && debugOpen">
      <div class="debug-row">
        <button class="btn btn-mini" @click="pingIris">Ping IRIS</button>
      </div>
      <div class="debug-row">
        <div class="debug-col">
          <div class="debug-title">Last sent</div>
          <pre class="debug-pre">{{ lastSentMsg }}</pre>
        </div>
        <div class="debug-col">
          <div class="debug-title">Last received</div>
          <pre class="debug-pre">{{ lastRecvMsg }}</pre>
        </div>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { COCO_KEYPOINTS, COCO_EDGES, MockPoseStream, type PoseFrame } from './pose';
import { useCameras } from './composables/useCameras';

const appTitle = import.meta.env.VITE_APP_TITLE as string || 'Example App';
const isDev = import.meta.env.DEV;

const sceneRef = ref<HTMLElement | null>(null);
const splitRef = ref<HTMLElement | null>(null);
// Individual dropdown open flags
const openCamera = ref(false);
const openTrack = ref(false);
const openOutput = ref(false);
// Camera menu focus + ARIA state
const cameraButtonRef = ref<HTMLButtonElement | null>(null);
const cameraListRef = ref<HTMLElement | null>(null);
const cameraActiveIndex = ref(0);
// Sign-in state
const userSignedIn = ref(false);

const {
  devices,
  selectedDeviceId,
  selectedDeviceLabel,
  enumerateCameras,
  selectDevice: selectCamera,
  init: initCameras,
  dispose: disposeCameras,
} = useCameras({
  autoReselect: true,
  onSend: (msg) => { try { lastSentMsg.value = JSON.stringify(msg, null, 2); } catch {} },
});
const activeCameraOptionId = computed(() => (devices.value.length > 0 ? `cam-opt-${cameraActiveIndex.value}` : undefined));

// Tracking options
const trackingOptions = ['Full body', 'Hand', 'Face'];
const trackingType = ref<string | null>(null);

// Output options
const outputOptions = ['SteamVR', 'Unity', 'UnReal', 'Gadot'];
const outputOption = ref<string | null>(null);

const irisConnected = ref(false);
const debugOpen = ref(false);
const lastSentMsg = ref('');
const lastRecvMsg = ref('');
let poseLogCount = 0; // throttle console logs for pose-frame
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
let modelRoot: THREE.Object3D | null = null;

const showModel = ref(false); // off by default
let irisUnsub: null | (()=>void) = null;

function onCameraButtonKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!openCamera.value) {
      openCamera.value = true; openTrack.value = false; openOutput.value = false;
      setInitialCameraActiveIndex(e.key === 'ArrowDown' ? 'first' : 'last');
      e.preventDefault();
      focusCameraListSoon();
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    openCamera.value = !openCamera.value;
    if (openCamera.value) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    openCamera.value = false; e.preventDefault();
  }
}

function onCameraListKeydown(e: KeyboardEvent) {
  if (devices.value.length === 0) {
    if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
    return;
  }
  const max = devices.value.length - 1;
  if (e.key === 'ArrowDown') { cameraActiveIndex.value = Math.min(max, cameraActiveIndex.value + 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'ArrowUp') { cameraActiveIndex.value = Math.max(0, cameraActiveIndex.value - 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Home') { cameraActiveIndex.value = 0; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'End') { cameraActiveIndex.value = max; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Enter') { const d = devices.value[cameraActiveIndex.value]; if (d) selectDevice(d); e.preventDefault(); }
  else if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
}

function setInitialCameraActiveIndex(mode: 'first' | 'last' | 'current-or-first'){
  if (devices.value.length === 0) { cameraActiveIndex.value = 0; return; }
  if (mode === 'last') cameraActiveIndex.value = devices.value.length - 1;
  else if (mode === 'current-or-first') {
    const idx = selectedDeviceId.value ? devices.value.findIndex(d => d.deviceId === selectedDeviceId.value) : -1;
    cameraActiveIndex.value = idx >= 0 ? idx : 0;
  } else cameraActiveIndex.value = 0;
}

function focusCameraListSoon(){ nextTick(() => cameraListRef.value?.focus()); }

function scrollActiveIntoView(){
  nextTick(() => {
    const el = document.getElementById(`cam-opt-${cameraActiveIndex.value}`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function toggleMenu() {
  // kept for backward compatibility but no-op now
  // Toggle camera dropdown by default for original behavior
  toggleCamera();
}
function toggleCamera() {
  const willOpen = !openCamera.value;
  openCamera.value = willOpen;
  // close others
  if (willOpen) { openTrack.value = false; openOutput.value = false; enumerateCameras(); }
}
function toggleTrack() {
  const willOpen = !openTrack.value;
  openTrack.value = willOpen;
  if (willOpen) { openCamera.value = false; openOutput.value = false; }
}
function toggleOutput() {
  const willOpen = !openOutput.value;
  openOutput.value = willOpen;
  if (willOpen) { openCamera.value = false; openTrack.value = false; }
}
 function onClickOutside(e: MouseEvent) {
  // close any open dropdown if click outside
  if (!openCamera.value && !openTrack.value && !openOutput.value) return;
  const dd = (e.target as HTMLElement)?.closest('.dropdown');
  if (!dd) { openCamera.value = false; openTrack.value = false; openOutput.value = false; }
}



function selectDevice(d: MediaDeviceInfo){
  // close just the camera dropdown
  openCamera.value = false;
  // For now, just log and maybe change background color subtly to show selection
  console.log('Selected device', d);
  selectCamera(d);
  if (renderer) {
    const col = new THREE.Color(0x0b0f14).offsetHSL(0.02, 0.05, 0.02);
    renderer.setClearColor(col, 1);
  }
  // Start mock pose stream when a camera is chosen (until IRIS real stream is wired)
  startMockPose();
  // Send camera info to IRIS mock bridge
  const info = { type: 'camera-info', payload: { deviceId: d.deviceId, label: d.label, kind: d.kind, ts: Date.now() } };
  console.log('[IRIS send] camera-info', info);
  lastSentMsg.value = JSON.stringify(info, null, 2);
  (window as any).electronAPI?.irisSend?.(info);
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
        child.material = new THREE.MeshStandardMaterial({ color: 0x6b83c6, metalness: 0.1, roughness: 0.8, transparent: true, opacity: 0.85 });
        child.castShadow = true; child.receiveShadow = true;
      }
    });
    obj.position.set(0, 0, 0);
    modelRoot = obj;
    modelRoot.visible = showModel.value;
    scene.add(modelRoot);
    fitToObject(obj);
  } catch (e) {
    console.warn('Failed to load SMPLX OBJ, using fallback', e);
    const geo = new THREE.TorusKnotGeometry(0.6, 0.2, 200, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6be675, metalness: 0.4, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    modelRoot = mesh;
    modelRoot.visible = showModel.value;
    scene.add(modelRoot);
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
  // Dev-only keyboard toggle for debug overlay
  if (isDev) {
    window.addEventListener('keydown', onKeyDown);
  }
  // Trigger split animation
  requestAnimationFrame(() => { splitRef.value?.classList.add('ready'); });

  if (sceneRef.value) initThree(sceneRef.value);
  initCameras();
  startMockPose();
  connectIris();
  // React to showModel toggle
  watch(showModel, (v) => { if (modelRoot) modelRoot.visible = v; });
  // Focus management for camera menu
  watch(openCamera, (isOpen) => {
    if (isOpen) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    else if (document.activeElement === cameraListRef.value) { cameraButtonRef.value?.focus(); }
  });
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  if (isDev) {
    window.removeEventListener('keydown', onKeyDown);
  }
  disposeCameras();
  if (frameId) cancelAnimationFrame(frameId);
  if (resizeObserver && sceneRef.value) resizeObserver.unobserve(sceneRef.value);
  if (renderer) { renderer.dispose(); renderer = null; }
  poseStream?.stop();
  if (irisUnsub) { try { irisUnsub(); } catch {}; irisUnsub = null; }
});

function onKeyDown(e: KeyboardEvent) {
  if (!isDev) return;
  if (e.key === 'F2') {
    debugOpen.value = !debugOpen.value;
  }
}

function connectIris(){
  try {
    irisUnsub = (window as any).electronAPI?.irisSubscribe?.((msg:any) => {
      // Mark connected when any message arrives from IRIS bridge
      irisConnected.value = true;
      if (msg?.type === 'pose-frame') {
        poseLogCount++;
        if (poseLogCount % 10 === 0) console.log('[IRIS recv]', msg);
      } else {
        console.log('[IRIS recv]', msg);
      }
      lastRecvMsg.value = JSON.stringify(msg, null, 2);
      if (msg?.type === 'pose-frame') {
        // Hook for future: apply msg.payload to updateSkeleton
      }
    }) ?? null;
  } catch { irisConnected.value = false; }
}

function pingIris(){
  const msg = { type: 'ping', ts: Date.now() };
  console.log('[IRIS send] ping', msg);
  lastSentMsg.value = JSON.stringify(msg, null, 2);
  (window as any).electronAPI?.irisSend?.(msg);
}

function initSkeleton(scene: THREE.Scene){
  // Joints
  const jointGeo = new THREE.SphereGeometry(0.02, 16, 16);
  const jointMat = new THREE.MeshBasicMaterial({ color: 0xff5533, depthTest: false, depthWrite: false });
  jointSpheres = COCO_KEYPOINTS.map(() => new THREE.Mesh(jointGeo, jointMat.clone()));
  jointSpheres.forEach(m => { m.visible = true; scene.add(m); });
  jointSpheres.forEach(m => m.renderOrder = 999);

  // Bones
  const positions = new Float32Array(COCO_EDGES.length * 2 * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
  boneLines = new THREE.LineSegments(geom, mat);
  boneLines.visible = true;
  boneLines.renderOrder = 998;
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

function selectTracking(t: string) {
  trackingType.value = t;
  openTrack.value = false;
  // notify backend/electron if desired
  const msg = { type: 'tracking-select', payload: { tracking: t, ts: Date.now() } };
  lastSentMsg.value = JSON.stringify(msg, null, 2);
  (window as any).electronAPI?.irisSend?.(msg);
}

function selectOutput(o: string) {
  outputOption.value = o;
  openOutput.value = false;
  const msg = { type: 'output-select', payload: { output: o, ts: Date.now() } };
  lastSentMsg.value = JSON.stringify(msg, null, 2);
  (window as any).electronAPI?.irisSend?.(msg);
}

function toggleSignIn() {
  // Simple placeholder toggle. Replace with real auth flow later.
  userSignedIn.value = !userSignedIn.value;
  const msg = { type: 'auth', payload: { signedIn: userSignedIn.value, ts: Date.now() } };
  lastSentMsg.value = JSON.stringify(msg, null, 2);
  (window as any).electronAPI?.irisSend?.(msg);
}
</script>

<style scoped>
.hud{ position: fixed; left: 16px; bottom: 16px; display:flex; gap:8px; padding:8px 10px; background: rgba(12,18,25,.6); border:1px solid rgba(255,255,255,.08); border-radius: 12px; backdrop-filter: blur(10px); }
.hud-item{ display:flex; align-items:center; gap:8px; color:#e6edf3; font-weight:600; }
.hud-item input{ accent-color:#6be675; width:16px; height:16px; }
.hud-sep{ width:1px; background:rgba(255,255,255,.1); margin:0 6px; }
.dot{ width:8px; height:8px; border-radius:50%; display:inline-block; box-shadow:0 0 10px rgba(0,0,0,.5) }
.dot.ok{ background:#6be675 }
.dot.warn{ background:#ff9a5c }
.btn.btn-mini{ padding:6px 10px; font-size:.8rem; border-radius:8px; border:1px solid rgba(255,255,255,.08); background:rgba(26,35,48,.8); color:#e6edf3; cursor:pointer }
.debug{ position: fixed; left: 16px; bottom: 70px; width: 540px; max-width: calc(100vw - 32px); background: rgba(12,18,25,.85); border:1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 10px; backdrop-filter: blur(10px); box-shadow:0 10px 28px rgba(0,0,0,.35) }
.debug-row{ display:flex; gap:10px; align-items:center; margin-bottom:8px }
.debug-col{ flex:1; min-width:0 }
.debug-title{ color:#9fb1c1; font-weight:700; font-size:.8rem; margin-bottom:4px }
.debug-pre{ margin:0; max-height:140px; overflow:auto; background:#0e141b; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.06); color:#cfe2f3; font-size:.78rem }

/* Navbar layout: brand left, menu centered, right side for sign-in */
.navbar{
  position: relative; /* enable absolute-centering of the menu */
  display:flex;
  align-items:center;
  justify-content: space-between; /* keep brand left and right area placed */
  gap:12px;
  padding:12px 18px;
}
.brand{ display:flex; align-items:center; gap:10px; color:#e6edf3; font-weight:700; z-index:2; }
.menu{
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 50%;
  transform-origin: center;
  transform: translate(-50%, -50%); /* center vertically and horizontally inside navbar */
  display:flex;
  align-items:center;
  gap:12px;
  z-index:1;
}
.nav-right{ display:flex; align-items:center; gap:12px; z-index:2; }
.btn-signin{
  padding:8px 12px;
  border-radius:9px;
  border:1px solid rgba(255,255,255,0.08);
  background: rgba(26,35,48,0.9);
  color: #e6edf3;
  cursor: pointer;
}
/* Accessibility focus styles */
.btn:focus-visible, .btn.btn-mini:focus-visible {
  outline: 2px solid #6be675;
  outline-offset: 2px;
}
.dropdown-menu:focus { outline: none; }
.device.active { background: rgba(107, 230, 117, 0.12); border-radius: 8px; }
.device.active > div > div { color: #e6ffe9; }
</style>
