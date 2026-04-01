'use strict';

const { app } = require('electron');
const os = require('os');
const path = require('path');

const PIPE_NAME = '\\\\.\\pipe\\iris_ipc';
 

const DEV_IRIS_CLI_EXE = process.env.IRIS_CLI_EXE 
  || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe');

function getIrisCliPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'iris_cli.exe');
  } 
  const resolved = process.env.IRIS_CLI_EXE 
    || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe'); 
  return resolved;
}

function getModelDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'models');
  } 
  return process.env.IRIS_MODELS_DIR 
    || path.join(os.homedir(), 'Documents', 'Iris', 'models');
}

function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const width = opts.camera_width ?? 1920;
  const height = opts.camera_height ?? 1080;
  const cameras = opts.cameras || [];
  const captureOnly = opts.capture_only === true;
  
  const camera_ids = cameras.map((_, index) => index);
  const fps = cameras.length > 0 && cameras[0].fps ? cameras[0].fps : 30;
  const modelDir = getModelDir().replace(/\\/g, '/'); // Normalize slashes for JSON

  // Define the base shared block
  const shared = {
    execution: {
      device_id: 0
    },
    camera_groups: {
      capture_rig: {
        camera_ids: camera_ids,
        width: width,
        height: height,
        fps: fps,
        batching: true,
        batch_camera_ids: camera_ids
      }
    },
    defaults: {
      output: {
        shm_name: "iris_shm_ipc",
        capacity: 120
      }
    }
  };

  // Only inject models and detection defaults if we are running the full pipeline
  if (!captureOnly) {
    shared.models = {
      detection: {
        rtmdet_people: {
          type: "rtmdet",
          rtmdet_engine_path: `${modelDir}/rtmdet_t_bs4_fp16.trt`,
          rtmdet_input_width: 640,
          rtmdet_input_height: 640,
          rtmdet_conf_threshold: 0.7,
          rtmdet_iou_threshold: 0.45
        }
      },
      reid: {
        osnet_x05: {
          enabled: true,
          engine_path: `${modelDir}/osnet_x05_fp16.trt`,
          min_detection_confidence: 0.55
        }
      },
      pose: {
        rtmpose_people: {
          engine: `${modelDir}/rtmpose_bs16_fp16.trt`,
          batch: 16,
          input_w: 192,
          input_h: 256,
          split_ratio: 2.0
        }
      }
    };
    shared.defaults.detection = {
      batch_size: 4,
      detection_skip_enabled: true,
      detection_skip_frames: 20
    };
  }

  // Define pipelines based on the flag
  const captureOnlyPipeline = {
    capture: {
      id: "capture",
      camera_group: "capture_rig",
      id_prefix: "cap"
    },
    output: {
      id: "output",
      camera_group: "capture_rig"
    }
  };

  const fullPipeline = {
    capture: {
      id: "capture",
      camera_group: "capture_rig",
      id_prefix: "cap"
    },
    detection: {
      id: "det0",
      model: "rtmdet_people",
      reid_model: "osnet_x05"
    },
    global_reid_tracking: {
      id: "global_track",
      single_person_mode: false,
      max_age: 200,
      min_hits: 1,
      min_detection_confidence: 0.5,
      appearance_threshold: 0.45,
      cross_camera_unconfirmed_threshold: 0.55
    },
    pose_estimation: {
      id: "pose0",
      model: "rtmpose_people"
    },
    triangulation: {
      id: "tri0",
      pose_source: "pose0",
      camera_group: "capture_rig",
      da3_startup_calibration: {
        engine: `${modelDir}/DA3-LARGE-1.1.engine`,
        output_dir: "output/triangulation_da3_startup",
        frame_source: "capture_rig", 
        viewer_align: true,
        save_ply: "scene.ply"
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
        cleanup_interval: 300
      }
    },
    output: {
      id: "output",
      camera_group: "capture_rig"
    }
  };

  return {
    run_id,
    runtime: {
      devices: {
        gpu: 0,
        cuda_streams: 2,
        nvenc: false
      },
      buffers: {
        frame_capacity: 256,
        pose_capacity: 256,
        export_shm: true,
        camera_count: Math.max(1, cameras.length),
        camera_slots: 32,
        camera_width: width,
        camera_height: height
      }
    },
    shared: shared,
    pipeline: captureOnly ? captureOnlyPipeline : fullPipeline
  };
}

module.exports = {
  PIPE_NAME,
  DEV_IRIS_CLI_EXE,
  buildConfigFromOptions,
  getIrisCliPath,
};
