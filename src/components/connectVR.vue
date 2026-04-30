<template>
  <div class="sidenav">
    Tracker Config:
    <div v-if="!IrisState.running">Start IRIS first</div>

    <div  v-for="(value, type) in trackerConfig">
      <div class="titles">
        {{trackerMap[type]}}: {{ trackerConfig[type] }} 
      </div>
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
    </div>
    <div style="position: relative;">
      <div class="titles invert">
        <span>
          Scale: 
          <span v-if="!invert">{{ scale }} </span>
          <span v-else>{{ (1/scale).toPrecision(3) }}</span>
        </span>
        <input 
          type="checkbox"
          v-model="invert"
          :disabled="!IrisState.running"
        >
      </div>
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
    rotation: [trackerConfig.value.xRotation, trackerConfig.value.yRotation, trackerConfig.value.zRotation],
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

onMounted(async () => {
  sessionId.value = await window.ipc?.connectVR(props.outputOption);
  console.log("[Connector] connected to VR")
})

onUnmounted(() => {
  console.log("[Connector] switching")
  if (sessionId.value) window.ipc?.disconnectVR(sessionId.value)
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
  width: 200px;
}

.invert {
  display: flex;
  flex-direction: row; 
  align-items: center;
  justify-content: space-between;
}
</style>