import { defineStore } from "pinia";

interface trackerConfig {
  xOffset: number,
  yOffset: number,
  zOffset: number,
  xRotation: number,
  yRotation: number,
  zRotation: number,
}

export const useConnectorStore = defineStore('connectorStore', {
  state: () => ({
    currentConfig: {
      xOffset: 0,
      yOffset: 0,
      zOffset: 0,
      xRotation: 0,
      yRotation: 0,
      zRotation: 0,
    } as trackerConfig,
    scale: 1 as number
  }),
  actions: {
    setCurrentConfig(config: trackerConfig) {
      this.currentConfig = config
    },
    setScale(scale: number) {
      this.scale = scale
    }
  }
})