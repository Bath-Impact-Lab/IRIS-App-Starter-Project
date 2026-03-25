import { defineStore } from "pinia";

export const useIrisStore = defineStore('irisStore', {
    state: () => ({
        running: false as boolean,
    }),
    actions: {
        setRunningState(isRunning: boolean) {
            this.running = isRunning
        },
    }
})