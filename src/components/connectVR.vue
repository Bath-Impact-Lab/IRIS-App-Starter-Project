<template>
  <div class="sidenav">
    Tracker Config:

    <div v-for="(value, type) in trackerConfig">
      <div class="titles">
        {{type}}: {{ trackerConfig[type] }} 
      </div>
      <input 
        v-model="trackerConfig[type]" 
        type="range" 
        min="-2.00" 
        max="2.00" 
        step="0.01"
        :id="type"
        v-on:mouseup="passConfig"
      >
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted } from 'vue';

const trackerConfig = ref({
  xOffset: 0,
  yOffset: 0,
  zOffset: 0,
  xRotation: 0,
  yRotation: 0,
  zRotation: 0,
  xScale: 0,
  yScale: 0,
  zScale: 0,
})

function passConfig() {
  const data = JSON.stringify(trackerConfig.value)
  // console.log(data)
  window.ipc?.updatePos(data)
}

onMounted(() => {
  window.ipc?.connectVR();
  console.log("connected to VR")
})

</script>

<style scoped>
.sidenav {
  position: absolute;
  left: 10px;
  top: 73px;
  width: 200px;
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
</style>