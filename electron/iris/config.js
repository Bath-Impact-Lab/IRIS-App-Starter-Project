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
  console.log('[Config] Using iris_cli.exe path:', process.env.IRIS_CLI_EXE );
  return process.env.IRIS_CLI_EXE || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe');
}


function getModelDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'models');
  }

  return process.env.IRIS_MODELS_DIR || path.join(os.homedir(), 'Documents', 'Iris', 'models');}


function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const width = opts.camera_width ?? 1920;
  const height = opts.camera_height ?? 1080;
  const cameras = opts.cameras || [];
  const modelDir = getModelDir();

  const cameraIds = cameras.map((c) => parseInt(c.uri));
  const fps = cameras[0]?.fps ?? 30;
  const rotation = cameras[0]?.rotation ?? 0;
  const openDelayMs = opts.open_delay_ms ?? (cameras.length > 1 ? 750 : 0);

  return {
    run_id,
    runtime: {
      devices: { gpu: 0, cuda_streams: 2, nvenc: false },
      buffers: {
        frame_capacity: 256,
        pose_capacity: 256,
        export_shm: true,
        camera_count: cameras.length,
        camera_slots: 32,
        camera_width: width,
        camera_height: height,
      },
    },
    shared: {
      execution: { device_id: 0 },
      camera_groups: {
        main: {
          camera_ids: cameraIds,
          width,
          height,
          fps,
          rotate: rotation,
          batching: true,
        },
      },
      models: {
        detection: {
          rtmdet_people: {
            type: 'rtmdet',
            rtmdet_engine_path: path.join(modelDir, 'rtmdet_t_bs4_fp16.trt'),
            rtmdet_input_width: 640,
            rtmdet_input_height: 640,
            rtmdet_conf_threshold: 0.7,
            rtmdet_iou_threshold: 0.45,
          },
        },
        reid: {
          osnet_x05: {
            enabled: true,
            engine_path: path.join(modelDir, 'osnet_x05_fp16.trt'),
            min_detection_confidence: 0.55,
          },
        },
        pose: {
          rtmpose_people: {
            engine: path.join(modelDir, 'rtmpose_bs16_fp16.trt'),
            batch: 16,
            input_w: 192,
            input_h: 256,
            split_ratio: 2.0,
          },
        },
      },
      defaults: {
        detection: {
          batch_size: 4,
          detection_skip_enabled: true,
          detection_skip_frames: 20,
        },
        output: {
          shm_name: 'iris_shm_ipc',
          capacity: 120,
        },
      },
    },
    pipeline: {
      capture: {
        camera_group: 'main',
        id_prefix: 'cap',
        open_delay_ms: openDelayMs,
      },
      detection: {
        id: 'det0',
        model: 'rtmdet_people',
        reid_model: 'osnet_x05',
      },
      global_reid_tracking: {
        id: 'global_track',
        single_person_mode: false,
        max_age: 200,
        min_hits: 1,
        min_detection_confidence: 0.5,
        appearance_threshold: 0.45,
        cross_camera_unconfirmed_threshold: 0.55,
      },
      pose_estimation: {
        id: 'pose0',
        model: 'rtmpose_people',
      },
      triangulation: {
        id: 'tri0',
        pose_source: 'pose0',
        camera_group: 'main',
        da3_startup_calibration: {
          engine: path.join(modelDir, 'DA3-LARGE-1.1.engine'),
          output_dir: 'output/triangulation_da3_startup',
          frame_source: 'frame_batch',
          viewer_align: true,
          save_ply: 'scene.ply',
        },
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
      output: {
        id: 'output',
        camera_group: 'main',
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
