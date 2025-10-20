export type Keypoint = {
  name: string;
  position: [number, number, number]; // meters
  score?: number;
};

export type PoseFrame = {
  keypoints: Keypoint[];
  timestamp: number; // ms
};

// COCO 17-keypoint set
export const COCO_KEYPOINTS = [
  'nose','left_eye','right_eye','left_ear','right_ear',
  'left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist',
  'left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'
];

// Typical edges for a stick-figure
export const COCO_EDGES: Array<[number, number]> = [
  [0,1],[0,2],[1,3],[2,4], // head
  [5,6], // shoulders
  [5,7],[7,9], // left arm
  [6,8],[8,10], // right arm
  [11,12], // hips
  [5,11],[6,12], // torso
  [11,13],[13,15], // left leg
  [12,14],[14,16] // right leg
];

type Subscriber = (frame: PoseFrame) => void;

export class MockPoseStream {
  private timer?: number;
  private subs = new Set<Subscriber>();
  private t = 0;
  private readonly dt = 1/30; // 30 fps

  start(){
    if (this.timer) return;
    const tick = () => {
      this.t += this.dt;
      const frame = this.generate(this.t);
      this.subs.forEach(fn => fn(frame));
      this.timer = setTimeout(tick, this.dt*1000) as unknown as number;
    };
    tick();
  }
  stop(){
    if (this.timer) { clearTimeout(this.timer as unknown as number); this.timer = undefined; }
  }
  subscribe(fn: Subscriber){ this.subs.add(fn); return () => this.subs.delete(fn); }

  private generate(t: number): PoseFrame {
    // Simple oscillating walk-in-place, height ~1.7m
    const h = 1.7;
    const hipY = 0.9;
    const shoulderY = 1.4;
    const baseX = 0, baseZ = 0; // centered

    const stride = 0.25;
    const swing = Math.sin(t*2.5);
    const sway = Math.sin(t*1.2)*0.05;

    const kp = (name: string, x: number, y: number, z: number): Keypoint => ({ name, position: [x, y, z], score: 0.99 });

    const k: Keypoint[] = [];
    // Head
    k.push(kp('nose', baseX + sway, shoulderY + 0.25, baseZ));
    k.push(kp('left_eye', baseX + 0.03 + sway, shoulderY + 0.28, baseZ));
    k.push(kp('right_eye', baseX - 0.03 + sway, shoulderY + 0.28, baseZ));
    k.push(kp('left_ear', baseX + 0.09 + sway, shoulderY + 0.26, baseZ));
    k.push(kp('right_ear', baseX - 0.09 + sway, shoulderY + 0.26, baseZ));

    // Shoulders
    const lShoulder = [baseX + 0.18, shoulderY, baseZ] as [number, number, number];
    const rShoulder = [baseX - 0.18, shoulderY, baseZ] as [number, number, number];
    k.push(kp('left_shoulder', ...lShoulder));
    k.push(kp('right_shoulder', ...rShoulder));

    // Arms swing
    k.push(kp('left_elbow', lShoulder[0] + 0.18, shoulderY - 0.22 + swing*0.06, baseZ));
    k.push(kp('right_elbow', rShoulder[0] - 0.18, shoulderY - 0.22 - swing*0.06, baseZ));
    k.push(kp('left_wrist', lShoulder[0] + 0.3, shoulderY - 0.45 + swing*0.09, baseZ));
    k.push(kp('right_wrist', rShoulder[0] - 0.3, shoulderY - 0.45 - swing*0.09, baseZ));

    // Hips
    const lHip = [baseX + 0.14, hipY, baseZ] as [number, number, number];
    const rHip = [baseX - 0.14, hipY, baseZ] as [number, number, number];
    k.push(kp('left_hip', ...lHip));
    k.push(kp('right_hip', ...rHip));

    // Legs walk in place
    k.push(kp('left_knee', lHip[0], hipY - 0.35 - swing*0.05, baseZ));
    k.push(kp('right_knee', rHip[0], hipY - 0.35 + swing*0.05, baseZ));
    k.push(kp('left_ankle', lHip[0], hipY - 0.7 - swing*0.1, baseZ + Math.max(0, swing)*stride));
    k.push(kp('right_ankle', rHip[0], hipY - 0.7 + swing*0.1, baseZ + Math.max(0, -swing)*stride));

    return { keypoints: k, timestamp: performance.now() };
  }
}
