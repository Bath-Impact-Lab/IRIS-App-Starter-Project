const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

function runOpenSimTool(exePath, setupXmlPath) {
  return new Promise((resolve, reject) => {
    console.log(`Running OpenSim Tool with setup: ${setupXmlPath}`);
    
    const proc = spawn(exePath, ['run-tool', setupXmlPath], {
      cwd: path.dirname(exePath),
      windowsHide: true
    });

    let outputLogs = '';

    proc.stdout.on('data', (data) => {
      const msg = data.toString();
      outputLogs += msg;
      console.log(`[OpenSim]: ${msg.trim()}`);
    });

    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      outputLogs += msg;
      console.error(`[OpenSim Error]: ${msg.trim()}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, logs: outputLogs });
      } else {
        reject(new Error(`OpenSim exited with code ${code}\nLogs:\n${outputLogs}`));
      }
    });
  });
}

async function runOpenSimPipeline({ staticTrcPath, motionTrcPath, subjectMass, subjectHeight, outputDir }) {
  const exePath = path.join(__dirname, 'third_party', 'opensim-cmd.exe');
  
  // Base paths
  const scaleTemplatePath = path.join(__dirname, 'opensimPipeline', 'Scaling', 'Setup_scaling_LaiUhlrich2022.xml');
  const ikTemplatePath = path.join(__dirname, 'opensimPipeline', 'IK', 'Setup_IK.xml');
  
  // The generic model AND the augmenter marker set
  const genericModelPath = path.join(__dirname, 'opensimPipeline', 'Models', 'LaiUhlrich2022.osim'); 
  const markerSetPath = path.join(__dirname, 'opensimPipeline', 'Models', 'LaiUhlrich2022_markers_augmenter.xml');

  // Outputs
  const scaledModelOutput = path.join(outputDir, 'subject_scaled.osim');
  const ikMotionOutput = path.join(outputDir, 'subject_ik.mot');

  try {
    // ==========================================
    // STEP 1: RUN SCALING
    // ==========================================
    let scaleXml = fs.readFileSync(scaleTemplatePath, 'utf8');
    
    // Use RegEx to replace the XML contents directly (now handling self-closing tags)
    scaleXml = scaleXml.replace(/<mass>.*?<\/mass>|<mass\s*\/>/g, `<mass>${subjectMass || 75.0}</mass>`);
    scaleXml = scaleXml.replace(/<model_file>.*?<\/model_file>|<model_file\s*\/>/g, `<model_file>${genericModelPath}</model_file>`);
    scaleXml = scaleXml.replace(/<marker_set_file>.*?<\/marker_set_file>|<marker_set_file\s*\/>/g, `<marker_set_file>${markerSetPath}</marker_set_file>`);
    scaleXml = scaleXml.replace(/<marker_file>.*?<\/marker_file>|<marker_file\s*\/>/g, `<marker_file>${staticTrcPath}</marker_file>`);
    scaleXml = scaleXml.replace(/<output_model_file>.*?<\/output_model_file>|<output_model_file\s*\/>/g, `<output_model_file>${scaledModelOutput}</output_model_file>`);
    scaleXml = scaleXml.replace(/<time_range>.*?<\/time_range>|<time_range\s*\/>/g, `<time_range>-1 9999</time_range>`);

    const tempScaleSetup = path.join(os.tmpdir(), `Setup_Scale_${Date.now()}.xml`);
    fs.writeFileSync(tempScaleSetup, scaleXml);

    console.log('--- Starting Scaling ---');
    await runOpenSimTool(exePath, tempScaleSetup);
    

    // ==========================================
    // STEP 2: RUN INVERSE KINEMATICS
    // ==========================================
    let ikXml = fs.readFileSync(ikTemplatePath, 'utf8');

    // RegEx replacements for IK (handling self-closing tags)
    ikXml = ikXml.replace(/<model_file>.*?<\/model_file>|<model_file\s*\/>/g, `<model_file>${scaledModelOutput}</model_file>`);
    ikXml = ikXml.replace(/<marker_file>.*?<\/marker_file>|<marker_file\s*\/>/g, `<marker_file>${motionTrcPath}</marker_file>`);
    ikXml = ikXml.replace(/<output_motion_file>.*?<\/output_motion_file>|<output_motion_file\s*\/>/g, `<output_motion_file>${ikMotionOutput}</output_motion_file>`);
    ikXml = ikXml.replace(/<results_directory>.*?<\/results_directory>|<results_directory\s*\/>/g, `<results_directory>${outputDir}</results_directory>`);
    const tempIkSetup = path.join(os.tmpdir(), `Setup_IK_${Date.now()}.xml`);
    fs.writeFileSync(tempIkSetup, ikXml);

    console.log('--- Starting IK ---');
    await runOpenSimTool(exePath, tempIkSetup);
    // fs.unlinkSync(tempIkSetup);

    return { 
        success: true, 
        scaledModelPath: scaledModelOutput, 
        ikMotionPath: ikMotionOutput 
    };

  } catch (error) {
    console.error('OpenSim Pipeline Failed:', error);
    throw error;
  }
}

module.exports = { runOpenSimPipeline };