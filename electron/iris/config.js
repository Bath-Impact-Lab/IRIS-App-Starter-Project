'use strict';

const { app } = require('electron');
const os = require('os');
const path = require('path');

const PIPE_NAME = '\\\\.\\pipe\\iris_ipc';
const DEV_IRIS_CLI_EXE = process.env.IRIS_CLI_EXE || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe');

function getIrisCliPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'iris_cli.exe');
  }

  return DEV_IRIS_CLI_EXE;
}

function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const width = opts.camera_width ?? 1920;
  const height = opts.camera_height ?? 1080;
  const cameras = opts.cameras || [];

  return {
    run_id,
    devices: { gpu: 0, cuda_streams: 2, nvenc: false },
    buffers: {
      frame_capacity: 256,
      pose_capacity: 256,
      export_shm: false,
      camera_count: cameras.length,
      camera_slots: 1,
      camera_width: width,
      camera_height: height,
    },
    capture: cameras.map((c, index) => ({
      name: `cap${index}`,
      params: {
        camera_id: index,
        width: c.width,
        height: c.height,
        rotate: c.rotation,
        format: 'BGR8',
        fps: c.fps,
        use_camera: true,
        device_id: 0,
        batching: true,
        batch_cameras: cameras.map((_, idx) => idx),
      },
    })),
    detection: {
      name: 'det0',
      params: {
        device_id: 0,
        batch_size: 4,
        rtmdet_engine_path: 'models/rtmdet_t_bs4_fp16.trt',
        rtmdet_input_width: 640,
        rtmdet_input_height: 640,
        rtmdet_conf_threshold: 0.7,
        rtmdet_iou_threshold: 0.45,
        detection_skip_enabled: true,
        detection_skip_frames: 20,
        reid_enabled: true,
        osnet_engine_path: 'models/osnet_x05_fp16.trt',
        reid_min_detection_conf: 0.55,
      },
    },
    global_reid_tracking: {
      name: 'global_track',
      params: {
        single_person_mode: false,
        max_age: 200,
        min_hits: 1,
        min_detection_confidence: 0.5,
        appearance_threshold: 0.45,
        cross_camera_unconfirmed_threshold: 0.55,
        use_motion_prediction: false,
      },
    },
    pose_estimation: {
      name: 'pose0',
      params: {
        device_id: 0,
        batch: 16,
        engine: 'models/rtmpose_bs16_fp16.trt',
        input_w: 192,
        input_h: 256,
        split_ratio: 2.0,
      },
    },
    triangulation: {
      name: 'tri0',
      params: {
        pose_sources: 'pose0',
        calibration_dir: 'calibration_output',
        extrinsics_file: 'calibration_output/extrinsics.json',
        camera_ids: [0, 1, 2, 3],
        compute_reprojection: true,
        store_reprojection_error: true,
        gate_by_reprojection_error: true,
        max_reprojection_error_px: 50.0,
        smoothing: {
          enabled: true,
          freq: 100.0,
          min_cutoff: 1.0,
          beta: 0.5,
          d_cutoff: 1.0,
          cleanup_interval: 300,
        },
      },
    },
    online_calibration: {
      name: 'online_calib',
      type: 'OnlineCalibration',
      inputs: { PoseBatch: 'triangulation.PoseBatch' },
      params: {
        window_size: 300,
        min_joint_conf: 0.6,
        learning_rate: 0.01,
        num_epochs: 100,
        huber_delta: 10.0,
      },
    },
    output: {
      name: 'output',
      params: {
        shm_name: 'iris_shm_ipc',
        capacity: 120,
        frame_width: width,
        frame_height: height,
        num_cameras: cameras.length,
      },
    },
  };
}

module.exports = {
  PIPE_NAME,
  DEV_IRIS_CLI_EXE,
  buildConfigFromOptions,
  getIrisCliPath,
};
