<template>
  <div class="sidenav">
    {{currentOut}} Tracker Config:
    <div v-if="!IrisState.running">Start IRIS first</div>

    <div  v-for="(value, type) in trackerConfig">
      <div class="titles">
        {{trackerMap[type]}}: {{ trackerConfig[type].toPrecision(2) }} 
      </div>
      <div class="adjust-row">
        <button class="adjust-button" @click="increment(type, false)" :disabled="!IrisState.running"> - </button>
        <input 
        class="sliders"
        v-model.number="trackerConfig[type]" 
        type="range" 
        min="-2.00" 
        max="2.00" 
        step="0.01"
        :id="type"
        :disabled="!IrisState.running"
        @dblclick="reset(type)"
        >
        <button class="adjust-button" @click="increment(type, true)" :disabled="!IrisState.running"> + </button>
      </div>
    </div>
    <div style="position: relative;">
      <div class="titles invert">
        <span>
          Scale: 
          <span v-if="!invert">{{ scale.toPrecision(3) }} </span>
          <span v-else>{{ (1/scale).toPrecision(3) }}</span>
        </span>
        <input 
          type="checkbox"
          v-model="invert"
          :disabled="!IrisState.running"
        >
      </div>
      <div class="adjust-row">        
        <button class="adjust-button" @click="increment('scale', false)" :disabled="!IrisState.running"> - </button>
        <input
          class="sliders"
          v-model.number="scale"
          type="range"
          min="1.0"
          max="10.0"
          step="0.1"
          :disabled="!IrisState.running"
          @dblclick="reset('scale')"
        >       
        <button class="adjust-button" @click="increment('scale', true)" :disabled="!IrisState.running"> + </button>
      </div>
    </div>

    <div class="connectBtn">
      <button 
        class="button btn" 
        @click="connect"
        :disabled="connected"
      >
        Connect
      </button>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { useIrisStore } from '@/Stores/irisStore';
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue';

const IrisState = useIrisStore()

interface Props {
  outputOption: string,
}

const props = defineProps<Props>()

const trackerMap = {
  xOffset: "X Offset",
  yOffset: "Y Offset",
  zOffset: "Z Offset",
  xRotation: "X Rotation",
  yRotation: "Y Rotation",
  zRotation: "Z Rotation",
}
const trackerConfig = ref({
  xOffset: 0,
  yOffset: 0,
  zOffset: 0,
  xRotation: 0,
  yRotation: 0,
  zRotation: 0,
})

const scale = ref(1)

const invert = ref(false)

const sessionId = ref<string>()

const currentOut = ref<string>("None")

const connected = ref(false)

watch(() => scale.value, (scale) => {
  passConfig()
})

watch(trackerConfig.value, (trackerConfig) => {
  passConfig()
})

function passConfig() {
  console.log("changed", trackerConfig, scale)
  const formatedData = {
    translation: [trackerConfig.value.xOffset, trackerConfig.value.yOffset, trackerConfig.value.zOffset],
    rotation: [trackerConfig.value.xRotation * Math.PI, trackerConfig.value.yRotation * Math.PI, trackerConfig.value.zRotation * Math.PI],
    scale: invert.value ? 1/scale.value : scale.value
  }
  const data = JSON.stringify(formatedData)
  // console.log("[VR Chat]", data)
  if (sessionId.value) window.ipc?.updatePos(data, sessionId.value)
}

function reset(sliderName: "scale" | "xOffset" | "yOffset" | "zOffset" | "xRotation" | "yRotation" | "zRotation") {
  if (sliderName === "scale") {
    scale.value = 0
  }
  else {
    trackerConfig.value[sliderName] = 0
  }
}

async function connect() {
  sessionId.value = await window.ipc?.connectVR(currentOut.value);
  console.log("[Connector] connected to VR")
  connected.value = true
}

function disconnect() {
  console.log("[Connector] switching")
  if (sessionId.value) window.ipc?.disconnectVR(sessionId.value)
  connected.value = false
}

function increment(type: "scale" | "xOffset" | "yOffset" | "zOffset" | "xRotation" | "yRotation" | "zRotation", add: boolean) {
  const incVal = add ? 0.01 : -0.01
  if (type === "scale") {
    scale.value += incVal
  }
  else {
    trackerConfig.value[type] += incVal
  }
}

onMounted(() => {
  if (props.outputOption !== "None") {  
    currentOut.value = props.outputOption
  }
  window.ipc?.panicked((data) => {
    connected.value = data
    console.log("panik")
  })
})

onUnmounted(() => {
  disconnect()
  currentOut.value = "None"
})

watch(() => props.outputOption, (option) => {
  console.log("here")
  if (option !== currentOut.value) {
    currentOut.value = option
    if (currentOut.value !== "None") {
      disconnect() //disconnect from previous linker
    }
  }
})

</script>

<style scoped>
.sidenav {
  position: absolute;
  left: 10px;
  top: 73px;
  width: 250px;
  background-color: var(--sidebar);
  opacity: 0.6;
  z-index: 10;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.titles {
  padding-top: 10px;
}

.sliders {
  -webkit-appearance: none;
  width: 170px;
  height: 20px;
  background: #d3d3d3;
  outline: none;
  opacity: 0.7;
  -webkit-transition: .2s;
  transition: opacity .2s;
}

.sliders::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: #04AA6D;
  cursor: pointer;
}

.adjust-row {
  display: flex; 
  flex-direction: row; 
  align-items: center;
  width: 100%;
}

.adjust-button {
  width: 20px;
  height: 20px;
  padding: 0px ;
  display: flex;
  align-items: center;
  justify-content: center;
  /* border-radius: 10px; */
  /* border: 1px solid; */
}

.invert {
  display: flex;
  flex-direction: row; 
  align-items: center;
  justify-content: space-between;
}

.button {
  border: 1px solid rgba(255,255,255,0.06);
  background: var(--sidebar);
  border-radius: 10px;
  margin-top: 10px;
}

.button:hover { background: rgba(18,27,36,0.72); }

.button:active { background: rgba(12,18,25,0.808); }

.button:hover:disabled  { 
  background: var(--sidebar)
}

.button:disabled  { 
  background: var(--sidebar)
}

.connectBtn :disabled {
  opacity: 0.5;
  transition: none;
  transform: none;
  box-shadow: none;
  cursor: default;
}

</style>