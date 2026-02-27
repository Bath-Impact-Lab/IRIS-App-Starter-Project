<template>
    <section class="scene" ref="sceneRef"></section>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed, ComputedRef } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/Addons.js';

interface Props {
  selectedCameraCount: number,
  irisData: IrisData[] | IrisData | null,
  rebuildPlaySpace: () => void,
  createPlaySpace: (scene: THREE.Scene) => void,
  addSceneCameras: (scene: THREE.Scene) => Promise<void>,
  spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null,
	skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null,
  test: boolean
}

const props = defineProps<Props>()
//defining emits for future
const emit = defineEmits<{
  giveScene: [THREE.Scene]
}>()

const selectedCameraCount = computed(() => props.selectedCameraCount)
const sceneRef = ref<HTMLElement | null>(null);


let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null;
let modelsRoot: THREE.Object3D[] | null = null;

let spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null = props.spheresMesh;
let skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null  = props.skeletonLine;
const position = new THREE.Object3D()

const manager = new THREE.LoadingManager();
let mixer: THREE.AnimationMixer[] | null;

const halpe26_pairs = [
  [0,1], [0,2], [1,3], [2,4],
  [17,18], [18,5], [18,6],
  [5,7], [7,9],
  [6,8], [8,10],
  [5,6],
  [11,12],
  [11,13], [13,15],
  [12,14], [14,16],
  [18,19], [19,11], [19,12],
  [15,20], [15,22], [15,24],
  [16,21], [16,23], [16,25]
]

const linePositions = new Float32Array(halpe26_pairs.length * 3 * 2)


onMounted(() => {
  if (sceneRef.value) initThree(sceneRef.value);
  if (resizeObserver && sceneRef.value) resizeObserver.unobserve(sceneRef.value);
})



async function loadModel(scene: THREE.Scene, type: string) {
  const loader = new FBXLoader( manager );
  const file = `assets/${type}`

  try {
    loader.load(file, function (group) {
      if (modelsRoot) {
        modelsRoot.push(group)
      }
      else {
        modelsRoot = [group]
      }
      const modelRoot = modelsRoot[modelsRoot.length-1]
      modelRoot.castShadow = true
      modelRoot.receiveShadow = true
      modelRoot.scale.set(0.01, 0.01, 0.01)
      if (type === "Idle.fbx") {
        modelRoot.position.set(-1.5, 0, -1.5)
        modelRoot.setRotationFromAxisAngle(new THREE.Vector3(0, 1, 0), 45*(Math.PI/180))
      }
      if (modelRoot.animations && modelRoot.animations.length) {
        if (mixer){
          mixer.push(new THREE.AnimationMixer(modelRoot))
        }
        else{
          mixer = [new THREE.AnimationMixer(modelRoot)]
        }
        const mix = mixer[mixer.length-1] 
        const action = mix.clipAction(modelRoot.animations[0])
        action.play()
      }
      else {
        mixer = null
      }
      scene.add(modelRoot)

    })
  }
  catch (err) {
    console.log("error loading file")
    console.log(err)
  }
}

async function initThree(container: HTMLElement){
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor('#0b0f14');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  emit('giveScene', scene)
  camera = new THREE.PerspectiveCamera(50, width/height, 0.01, 1000);
  camera.position.set(5, 5, 5);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(2, 3, 2); dir.castShadow = true; scene.add(dir);

  const grid = new THREE.GridHelper(10, 20, 0x2a3340, 0x1b2430); scene.add(grid);

  watch(selectedCameraCount, () => { nextTick(() => props.rebuildPlaySpace()); });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;


  // Add scene cameras from extrinsics
  await props.addSceneCameras(scene);

  // Build play space from loaded camera frustums
  props.createPlaySpace(scene);

  const clock = new THREE.Clock();

  //if using a positions json
  const fps = 30
  const frameDuration = 1000/fps

  let lastTime = 0
  let currentFrame = 0
  const animate = (time: number) => {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    if (mixer) mixer.forEach((mix) => mix.update(delta))

    if (props.irisData) {

      //used for data from position json file
      if (time - lastTime >= frameDuration && Array.isArray(props.irisData)) {
        renderIRISdata(props.irisData[currentFrame])

        currentFrame = (currentFrame + 1) % props.irisData.length
        lastTime = time
      }
      //used for live data
      else if (!Array.isArray(props.irisData)) {
        renderIRISdata(props.irisData)
      }
    }
    controls?.update()
    renderer?.render(scene, camera)
  };
  animate(lastTime)

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries){
      const w = entry.contentRect.width; const h = entry.contentRect.height;
      renderer!.setSize(w, h);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
  });
  resizeObserver.observe(container);
}

function renderIRISdata(poseInfo: IrisData) {
  try {
    poseInfo.entities.forEach((person, i) => {
      const neck = person.analysis.centers.neck
      const pelvis = person.analysis.centers.pelvis
      const spine_mid = person.analysis.centers.spine_mid
      const keypoints = [[neck.x, neck.y, neck.z], [pelvis.x, pelvis.y, pelvis.z], [spine_mid.x, spine_mid.y, spine_mid.z]]
      if (!(spheresMesh && skeletonLine)) {
        const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff})
        spheresMesh = new THREE.InstancedMesh(sphereGeometry, material, (keypoints.length + person.skeleton.keypoints_3d.length))
        scene.add(spheresMesh)

        const lMaterial = new THREE.LineBasicMaterial({color:0xff0000})
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
      person.skeleton.keypoints_3d.forEach((points, i) => {
        position.position.set(points.x, points.z, points.y)
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i+3, position.matrix)
      })

      halpe26_pairs.forEach(([a, b]) => {
        const pos1 = person.skeleton.keypoints_3d[a]
        const pos2 = person.skeleton.keypoints_3d[b]

        positionAttr.array[idx++] = pos1.x
        positionAttr.array[idx++] = pos1.z
        positionAttr.array[idx++] = pos1.y

        positionAttr.array[idx++] = pos2.x
        positionAttr.array[idx++] = pos2.z
        positionAttr.array[idx++] = pos2.y
      })

      positionAttr.needsUpdate = true
      spheresMesh.instanceMatrix.needsUpdate = true
    })
  }
  catch{
    console.log("unable to pass the IRIS data")
  }
}

</script>