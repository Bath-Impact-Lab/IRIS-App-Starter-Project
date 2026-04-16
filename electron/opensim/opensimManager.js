const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

async function runOpenSimScaling(params) {
    const { 
        genericSetupPath, 
        genericModelPath, 
        trcFilePath, 
        subjectMass, 
        subjectHeight,
        startTime,
        endTime,
        outputDir
    } = params;

    // 1. Read the generic template
    let templateXml = fs.readFileSync(genericSetupPath, 'utf8');

    // 2. Replace placeholders with actual data
    templateXml = templateXml.replace(/{{SUBJECT_MASS}}/g, subjectMass);
    templateXml = templateXml.replace(/{{SUBJECT_HEIGHT}}/g, subjectHeight);
    templateXml = templateXml.replace(/{{GENERIC_MODEL_PATH}}/g, genericModelPath);
    templateXml = templateXml.replace(/{{TRC_FILE_PATH}}/g, trcFilePath);
    templateXml = templateXml.replace(/{{START_TIME}}/g, startTime);
    templateXml = templateXml.replace(/{{END_TIME}}/g, endTime);

    // Define output paths
    const outputModelPath = path.join(outputDir, 'scaled_model.osim');
    templateXml = templateXml.replace(/{{OUTPUT_MODEL_PATH}}/g, outputModelPath);

    // 3. Write the filled XML to a temporary file
    const tempSetupPath = path.join(os.tmpdir(), `Setup_Scale_Temp_${Date.now()}.xml`);
    fs.writeFileSync(tempSetupPath, templateXml);

    // 4. Run opensim-cmd.exe with the temp setup file
    const opensimExe = path.join(__dirname, 'opensim', 'third_party', 'opensim-cmd.exe'); // Adjust path as needed
    
    return new Promise((resolve, reject) => {
        console.log('Running OpenSim Scale Tool...');
        
        const opensimProcess = spawn(opensimExe, ['run-tool', tempSetupPath]);

        opensimProcess.stdout.on('data', (data) => {
            console.log(`OpenSim: ${data}`);
        });

        opensimProcess.stderr.on('data', (data) => {
            console.error(`OpenSim Error: ${data}`);
        });

        opensimProcess.on('close', (code) => {
            // Optional: Clean up the temp file after running
            if (fs.existsSync(tempSetupPath)) {
                fs.unlinkSync(tempSetupPath);
            }

            if (code === 0) {
                resolve({ success: true, modelPath: outputModelPath });
            } else {
                reject(new Error(`OpenSim exited with code ${code}`));
            }
        });
    });
}

module.exports = { runOpenSimScaling };