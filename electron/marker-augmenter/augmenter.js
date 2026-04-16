const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(__dirname, 'augmenter.onnx');
let cachedSession = null;

async function getSession() {
    if (!cachedSession) {
        cachedSession = await ort.InferenceSession.create(MODEL_PATH);
    }

    return cachedSession;
}

function normalizeInputPayload(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw && Array.isArray(raw.frames)) {
        return raw.frames;
    }

    return null;
}

function flattenFrames(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
        throw new Error('poses.json contains no frames.');
    }

    const first = frames[0];
    if (!Array.isArray(first) || first.length === 0) {
        throw new Error('poses.json frames must be arrays of numbers.');
    }

    const featureLength = first.length;
    const sequenceLength = frames.length;
    const flat = new Float32Array(sequenceLength * featureLength);

    for (let i = 0; i < sequenceLength; i += 1) {
        const frame = frames[i];
        if (!Array.isArray(frame) || frame.length !== featureLength) {
            throw new Error('All frames must have the same length.');
        }

        for (let j = 0; j < featureLength; j += 1) {
            const value = frame[j];
            flat[i * featureLength + j] = Number.isFinite(value) ? value : 0;
        }
    }

    return { flat, sequenceLength, featureLength };
}

function reshapeOutput(outputTensor) {
    const dims = outputTensor.dims;
    const data = outputTensor.data;

    if (!Array.isArray(dims) || dims.length < 2) {
        return { dims, frames: Array.from(data) };
    }

    const sequenceLength = dims[dims.length - 2];
    const featureLength = dims[dims.length - 1];
    const frames = [];

    for (let i = 0; i < sequenceLength; i += 1) {
        const start = i * featureLength;
        const end = start + featureLength;
        frames.push(Array.from(data.slice(start, end)));
    }

    return { dims, frames };
}

async function runMarkerAugmentation(posesPath, outputDir) {
    if (typeof posesPath !== 'string' || posesPath.trim().length === 0) {
        throw new Error('posesPath is required.');
    }

    const inputPath = posesPath.trim();
    if (!fs.existsSync(inputPath)) {
        throw new Error(`poses.json not found at ${inputPath}`);
    }
    const raw = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(raw);
    const frames = normalizeInputPayload(parsed);

    if (!frames) {
        throw new Error('Unsupported poses.json format. Expected an array of frames or { frames: [...] }.');
    }

    const { flat, sequenceLength, featureLength } = flattenFrames(frames);
    const session = await getSession();

    const inputTensor = new ort.Tensor('float32', flat, [1, sequenceLength, featureLength]);
    const feeds = { [session.inputNames[0]]: inputTensor };
    const results = await session.run(feeds);

    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];
    const reshaped = reshapeOutput(outputTensor);

    const targetDir = outputDir && outputDir.trim().length > 0
        ? outputDir.trim()
        : path.dirname(inputPath);
    const outputPath = path.join(targetDir, 'augmented-poses.json');

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({
        source: inputPath,
        dims: reshaped.dims,
        frames: reshaped.frames,
    }, null, 2), 'utf8');

    return { outputPath, dims: reshaped.dims };
}

module.exports = {
    runMarkerAugmentation,
};