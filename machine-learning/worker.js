const COLOR_TOLERANCE = 50;
const MIN_MATCH_RATIO = 0.94;
const COARSE_MATCH_RATIO = 0.7;
const SCAN_STEP = 6;
const REFINE_RADIUS = Math.ceil(SCAN_STEP / 2);
const MAX_SAMPLES = 96;
const MAX_MATCHES_PER_TEMPLATE = 6;

let templates = [];
let frameCanvas;
let frameContext;

function prepareSamples(template) {
    const pixels = new Uint8Array(template.pixels);
    const samples = [];
    const gridSize = 9;

    for (let gridY = 0; gridY < gridSize; gridY++) {
        for (let gridX = 0; gridX < gridSize; gridX++) {
            const minX = Math.max(1, Math.floor(gridX * template.width / gridSize));
            const maxX = Math.min(template.width - 1, Math.floor((gridX + 1) * template.width / gridSize));
            const minY = Math.max(1, Math.floor(gridY * template.height / gridSize));
            const maxY = Math.min(template.height - 1, Math.floor((gridY + 1) * template.height / gridSize));
            let bestSample = null;

            for (let y = minY; y < maxY; y++) {
                for (let x = minX; x < maxX; x++) {
                    const index = (y * template.width + x) * 4;
                    if (pixels[index + 3] < 250) continue;

                    const neighbors = [
                        index - 4,
                        index + 4,
                        index - template.width * 4,
                        index + template.width * 4
                    ];
                    if (neighbors.some((neighbor) =>
                        Math.abs(pixels[index] - pixels[neighbor]) > 8 ||
                        Math.abs(pixels[index + 1] - pixels[neighbor + 1]) > 8 ||
                        Math.abs(pixels[index + 2] - pixels[neighbor + 2]) > 8
                    )) continue;

                    const contrast = Math.max(
                        Math.abs(pixels[index] - 100),
                        Math.abs(pixels[index + 1] - 176),
                        Math.abs(pixels[index + 2] - 255)
                    );
                    if (!bestSample || contrast > bestSample.contrast) {
                        bestSample = {
                            x,
                            y,
                            red: pixels[index],
                            green: pixels[index + 1],
                            blue: pixels[index + 2],
                            contrast
                        };
                    }
                }
            }

            if (bestSample) samples.push(bestSample);
        }
    }

    if (samples.length < 12 || samples.length > MAX_SAMPLES) {
        throw new Error(`Duck sprite template ${template.name} has an invalid number of opaque pixels`);
    }

    return {
        name: template.name,
        width: template.width,
        height: template.height,
        samples
    };
}

function colorMatches(frame, frameWidth, x, y, sample) {
    const index = (y * frameWidth + x) * 4;
    return Math.abs(frame[index] - sample.red) <= COLOR_TOLERANCE &&
        Math.abs(frame[index + 1] - sample.green) <= COLOR_TOLERANCE &&
        Math.abs(frame[index + 2] - sample.blue) <= COLOR_TOLERANCE;
}

function addMatch(matches, candidate, minDistance = 14) {
    const existing = matches.find((match) =>
        Math.hypot(match.x - candidate.x, match.y - candidate.y) < minDistance
    );

    if (existing) {
        if (candidate.score > existing.score) Object.assign(existing, candidate);
        return;
    }

    matches.push(candidate);
    matches.sort((first, second) => second.score - first.score);
    if (matches.length > MAX_MATCHES_PER_TEMPLATE) matches.pop();
}

function findTemplateMatches(frame, frameWidth, frameHeight, stageScaleX, stageScaleY) {
    const found = [];

    templates.forEach((template) => {
        const displayWidth = Math.round(template.width * stageScaleX);
        const displayHeight = Math.round(template.height * stageScaleY);
        const samples = template.samples.map((sample) => ({
            x: Math.round(sample.x * stageScaleX),
            y: Math.round(sample.y * stageScaleY),
            red: sample.red,
            green: sample.green,
            blue: sample.blue,
            contrast: sample.contrast
        }));
        const anchors = [...samples]
            .sort((first, second) => second.contrast - first.contrast)
            .slice(0, 8);
        const coarseMatches = [];

        for (let top = 0; top <= frameHeight - displayHeight; top += SCAN_STEP) {
            for (let left = 0; left <= frameWidth - displayWidth; left += SCAN_STEP) {
                let anchorMatches = 0;
                for (const sample of anchors) {
                    if (colorMatches(frame, frameWidth, left + sample.x, top + sample.y, sample)) {
                        anchorMatches++;
                    }
                }
                if (anchorMatches < Math.ceil(anchors.length / 2)) continue;

                let matchedSamples = 0;
                for (const sample of samples) {
                    if (colorMatches(frame, frameWidth, left + sample.x, top + sample.y, sample)) {
                        matchedSamples++;
                    }
                }

                const score = matchedSamples / samples.length;
                if (score >= COARSE_MATCH_RATIO) {
                    addMatch(coarseMatches, {
                        left,
                        top,
                        x: left + displayWidth / 2,
                        y: top + displayHeight / 2,
                        score
                    }, 24);
                }
            }
        }

        coarseMatches.forEach((coarse) => {
            let bestMatch = null;
            const minTop = Math.max(0, coarse.top - REFINE_RADIUS);
            const maxTop = Math.min(frameHeight - displayHeight, coarse.top + REFINE_RADIUS);
            const minLeft = Math.max(0, coarse.left - REFINE_RADIUS);
            const maxLeft = Math.min(frameWidth - displayWidth, coarse.left + REFINE_RADIUS);

            for (let top = minTop; top <= maxTop; top++) {
                for (let left = minLeft; left <= maxLeft; left++) {
                    let matchedSamples = 0;
                    for (const sample of samples) {
                        if (colorMatches(frame, frameWidth, left + sample.x, top + sample.y, sample)) {
                            matchedSamples++;
                        }
                    }

                    const score = matchedSamples / samples.length;
                    if (score >= MIN_MATCH_RATIO && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { left, top, score };
                    }
                }
            }

            if (bestMatch) {
                found.push({
                    x: bestMatch.left + displayWidth / 2,
                    y: bestMatch.top + displayHeight / 2,
                    score: bestMatch.score * 100,
                    template: template.name
                });
            }
        });
    });

    found.sort((first, second) => second.score - first.score);
    const detections = [];
    for (const match of found) {
        if (detections.some((detection) =>
            Math.hypot(detection.x - match.x, detection.y - match.y) < 24
        )) continue;

        const [, color, direction] = match.template.split('/');
        detections.push({
            x: match.x,
            y: match.y,
            label: `duck-${color}`,
            trackKey: `${color}-${direction}`,
            score: match.score.toFixed(2)
        });
    }

    return detections;
}

self.onmessage = ({ data }) => {
    if (data.type === 'initialize') {
        templates = data.templates.map(prepareSamples);
        postMessage({ type: 'detector-ready', templateCount: templates.length });
        return;
    }

    if (data.type !== 'predict') return;

    try {
        if (!frameCanvas || frameCanvas.width !== data.image.width || frameCanvas.height !== data.image.height) {
            frameCanvas = new OffscreenCanvas(data.image.width, data.image.height);
            frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
        }

        frameContext.drawImage(data.image, 0, 0);
        const imageData = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
        const predictions = findTemplateMatches(
            imageData.data,
            frameCanvas.width,
            frameCanvas.height,
            data.stageScaleX,
            data.stageScaleY
        );
        data.image.close();

        postMessage({
            type: 'predictions',
            predictions,
            inferenceMs: Date.now() - data.capturedAt,
            capturedAt: data.capturedAt,
            screenWidth: data.screenWidth,
            screenHeight: data.screenHeight,
            frameWidth: frameCanvas.width,
            frameHeight: frameCanvas.height,
            requestId: data.requestId
        });
    } catch (error) {
        data.image.close();
        console.error('Duck sprite detection failed:', error);
    } finally {
        postMessage({ type: 'prediction-complete', requestId: data.requestId });
    }
};
