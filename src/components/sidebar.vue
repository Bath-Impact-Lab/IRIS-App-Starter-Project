<template>
	<div class="sidenav">
		<div class="cameras">
			<div class="brand">
				Camera Config:
			</div>
			<div style="width: 100%;" v-for="(d, i) in props.selectedCameras">
				<div
					class="camera-list"
					:style="{
						width: '100%',
						boxShadow: props.sceneCameras[i] ? `inset 4px 0 0 ${props.sceneCameras[i].color}` : 'none',
						paddingLeft: props.sceneCameras[i] ? '8px' : '0',
					}"
				>
					<div class="camera-text">
						{{ d.label }}
						<button class="button btn" style="padding: 3px 5px;" v-on:click="rotateCamera(d, i)" :disabled="running">
							<img style="width: 30px;" src="/assets/anticlockwise-2-line.svg" alt="">
						</button>
					</div>
					<div :id="`camera-box${i}`">
						<video 
							style="width: 100%;"
							:id="`cameraFeed${i}`" 
							autoplay
							playsinline
						>
						</video>
					</div>
				</div>
			</div>
		</div>
		<div class="iris-controls" v-if="props.selectedCameras">
			<button v-on:click="startIris" class="button btn" :disabled="running">
				Start IRIS
			</button>
			<button v-on:click="stopIris" class="button btn" :disabled="!running">
				Stop IRIS
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed, Ref } from 'vue';
import { useCameras } from './../lib/useCameras';
import { useSceneCameras, SceneCameraEntry } from './../lib/useSceneCameras';
import * as THREE from 'three';

interface Props {
	spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null,
	skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null,
	personCount: string | null,
	scene: THREE.Scene | null,
	irisData: IrisData[] | IrisData | null
	selectedCameras: MediaDeviceInfo[] | null
	sceneCameras: SceneCameraEntry[]
}
const props = defineProps<Props>()

const emit = defineEmits<{
	sphereUpdate: [THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null],
	skeletonUpdate: [THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null]
	irisDataUpdate: [IrisData[] | IrisData | null]
	isRunning: [boolean]
}>()


const selectedCameraCount = computed(() => props.selectedCameras?.length ?? 0);
const { setGizmoRotation } = useSceneCameras(selectedCameraCount);

const cameraRotation = ref<Record<string, number>>({});
const running = ref(false)


function rotateCamera(d: MediaDeviceInfo, index: number) {
  const currentAngle = cameraRotation.value[d.deviceId] || 0;
  const newAngle = (currentAngle + 90) % 360;
  cameraRotation.value[d.deviceId] = newAngle;

  // Update the 3D scene camera gizmo rotation
  setGizmoRotation(index, newAngle);

  rotation(d, newAngle, index);
  cameraRotation.value[d.deviceId] = newAngle;
  rotation(d, newAngle, index);
}

async function rotation(d: MediaDeviceInfo, rotateAngle: number, i: number) {
  let isOdd: boolean
  let offsetX: number
  let offsetY: number = 0
  let origin: string
  
  const camera = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: d.deviceId}}})
  let aspectRatio = camera.getVideoTracks()[0].getSettings().aspectRatio
  if (!aspectRatio) {
    aspectRatio = 1.777778
  }

  if (rotateAngle % 180 === 0) {
    isOdd = false
  }
  else {
    aspectRatio = 1/aspectRatio
    isOdd = true
  }

  const parent = document.getElementById(`camera-box${i}`) as HTMLDivElement
  parent.style.width = "100%"

  parent.style.aspectRatio = `${aspectRatio}`
  const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement
  await new Promise(resolve => setTimeout(resolve, 50))
  if (isOdd) {
    const temp = parent.offsetWidth / aspectRatio
    parent.style.height = temp + "px"
    video.style.width = temp + "px"
    video.style.maxWidth = temp + "px"
    video.style.height = parent.offsetWidth + "px"
    video.style.maxHeight = parent.offsetWidth + "px"

    offsetX = video.offsetHeight
    origin = "top left"
    if (rotateAngle == 270) {
      offsetY = video.offsetWidth;
      offsetX = 0;
    }
  }
  else {
    video.style.width = parent.offsetWidth + "px"
    video.style.height = "auto"
    video.style.maxWidth = "100%"
    parent.style.height = "auto"

    offsetX = 0
    origin = "center"
  }
  video.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotateAngle}deg)`
  video.style.transformOrigin = origin
}

async function startIris() {
  emit('sphereUpdate', null)
	emit('skeletonUpdate', null)
  //Sends the camera information to IRIS
  if (props.selectedCameras) {
    const cameras = Array.from(props.selectedCameras, (d, i) => ({
      uri: String(i),
      width: 1920,
      height: 1080,
      fps: 100,
      rotation: cameraRotation.value[d.deviceId] ? cameraRotation.value[d.deviceId] : 0
    }))
    const options = {
      kp_format: "halpe26",
      subjects: props.personCount,
      cameras: cameras,
      camera_width: 1920,
      camera_height: 1080,
      video_fps: 100,
      output_dir: "",
      stream: true,
    }

    props.selectedCameras?.forEach((_, i) => {
      stopCameraStream(i)
    });
    await new Promise( resolve => setTimeout(resolve, 1000))

    running.value = true
		emit('isRunning', running.value)
    // iris start command goes here:
    await window.ipc?.startIRIS(options)
  }
	console.log(props.scene)
}

async function stopIris() {
  running.value = false
	emit('isRunning', running.value)

  //stop iris command to ipc here
  const Id = "example"
  await window.ipc?.stopIRIS(Id)

  props.selectedCameras?.forEach((d, i) => {
    startCameraStream(d, i)
  })

  if (props.spheresMesh && props.scene) {
    const here = props.scene.remove(props.spheresMesh)
    console.log("removed", here)
  }
	emit('sphereUpdate', null)
  if (props.skeletonLine && props.scene) props.scene.remove(props.skeletonLine)
	emit('skeletonUpdate', null)
	emit('irisDataUpdate', null)
}

function stopCameraStream(index: number) {
  try {
    const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
    const stream = video.srcObject as MediaStream;
    const tracks = stream.getTracks();
    
    tracks.forEach(track => {
    track.stop();
    });
    video.srcObject = null;
  }
  catch {
    console.log("Cameras are gone")
  }
}

async function startCameraStream(camera: MediaDeviceInfo, index: number) {
  const stream = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: camera.deviceId}, frameRate: 30}});

  const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
  try {
    if (video) {
      video.srcObject = stream;
      // console.log("playing", props.selectedCameras);
    } 
  } catch (err) {
    console.error("Camera access failed: ", err);
  }
}

</script>

<style scoped>
.brand{ display:flex; justify-content:center; gap:10px; color:#e6edf3; font-weight:700; z-index:2; }

.sidenav {
  position: absolute; 
  right: 0px; 
  height: calc(100% - 63px); 
  width: 250px; 
  background-color: var(--sidebar);
  z-index: 10;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.camera-list {
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  margin: 5px 0;
} 

.camera-text {
  display: flex;
  flex-direction: row;
  font-size: 14px;
  align-items: center;
  padding-bottom: 5px;
  justify-content: space-between;
}

.button {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--sidebar);
  border-radius: 10px;
}

.button:hover {
  background: rgba(18, 27, 36, 0.72);
}

.button:active {
  background: rgba(12, 18, 25, 0.808);
}

.iris-controls {
  padding: 10px 5px;
  background-color: var(--sidebar);
  position: absolute;
  bottom: 0px;
  width: 100%;
  height: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 100;
}

.iris-controls button {
  margin: 10px 0;
}

.cameras {
  height: 75%;
  width: 100%;
  overflow-y: auto;
	scrollbar-width: none;
  overflow-x: hidden;
}
</style>