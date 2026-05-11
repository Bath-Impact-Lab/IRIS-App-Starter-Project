import { defineStore } from "pinia";

interface options {
  kp_format: string,
  subjects: string | null,
  cameras: {
    uri: string,
    width: number,
    height: number,
    fps: number,
    rotation: number
  }[],
  camera_width: number,
  camera_height: number,
  video_fps: number,
  output_dir: string,
  stream: boolean
}

export const useIrisStore = defineStore('irisStore', {
  state: () => ({
    running: false as boolean,
    start: false as boolean,
    option: {
      kp_format: 'halpe26',
      subjects: "single",
      cameras: [],
      camera_width: 1920,
      camera_height: 1080,
      video_fps: 30,
      output_dir: '',
      stream: true,
    } as options,
  }),
  actions: {
    setRunningState(isRunning: boolean) {
      this.running = isRunning
    },
    setStartState(isStarted: boolean) {
      this.start = isStarted
    },
    setOptionState(option: options) {
      this.option = option
    },
  }
})