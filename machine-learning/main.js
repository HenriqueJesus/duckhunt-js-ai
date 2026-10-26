import { buildLayout } from "./layout";

export default async function main(game) {
    const container = buildLayout(game.app);
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const duckTemplates = Object.entries(game.textures)
        .filter(([name]) => /^duck\/(red|black)\/(left|right|top-left|top-right)\/\d+\.png$/.test(name))
        .map(([name, texture]) => {
            const { pixels, width, height } = game.app.renderer.extract.pixels(texture);
            return {
                name,
                width,
                height,
                pixels: pixels.slice().buffer
            };
        });

    if (duckTemplates.length === 0) {
        throw new Error('Could not find the duck sprite templates for visual detection');
    }
    worker.postMessage(
        { type: 'initialize', templates: duckTemplates },
        duckTemplates.map(({ pixels }) => pixels)
    );

    game.stage.aim.visible = false;
    let detectorReady = false;
    let gameStarted = false;
    let inferencePending = false;
    let requestId = 0;
    let lastShotAt = 0;
    let trackedLevel = null;
    let trackedWave = null;
    let previousPredictions = [];
    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = 800;
    detectionCanvas.height = 600;
    const detectionContext = detectionCanvas.getContext('2d');
    detectionContext.imageSmoothingEnabled = false;
    const SHOT_COOLDOWN_MS = 350;
    const MIN_TRACK_DISTANCE = 3;
    const MAX_TRACK_DISTANCE = 600;
    const MAX_TRACK_AGE_MS = 2000;
    const MAX_TARGET_SPEED = 1.2;
    const MAX_PREDICTION_MS = 500;

    function startGame() {
        if (gameStarted) return;

        gameStarted = true;
        game.startLevel().then(() => {
            if (detectorReady) captureFrame();
        }).catch((error) => {
            console.error('Could not start the game after loading the duck detector:', error);
        });
    }

    function captureFrame() {
        if (!detectorReady || inferencePending) return;

        inferencePending = true;
        requestId += 1;
        const capturedAt = Date.now();

        try {
            const aimWasVisible = game.stage.aim.visible;
            const hudWasVisible = container.visible;
            let canvas;

            try {
                game.stage.aim.visible = false;
                container.visible = false;
                canvas = game.app.renderer.extract.canvas(game.app.stage);
            } finally {
                game.stage.aim.visible = aimWasVisible;
                container.visible = hudWasVisible;
            }

            detectionContext.drawImage(canvas, 0, 0, detectionCanvas.width, detectionCanvas.height);
            createImageBitmap(detectionCanvas).then((bitmap) => {
                worker.postMessage({
                    type: 'predict',
                    image: bitmap,
                    capturedAt,
                    screenWidth: game.app.renderer.screen.width,
                    screenHeight: game.app.renderer.screen.height,
                    requestId
                }, [bitmap]);
            }).catch((error) => {
                inferencePending = false;
                console.error('Could not create game frame for AI:', error);
                setTimeout(captureFrame, 100);
            });
        } catch (error) {
            inferencePending = false;
            console.error('Could not capture game frame for AI:', error);
            setTimeout(captureFrame, 100);
        }
    }

    worker.onerror = (error) => {
        inferencePending = false;
        console.error('AI worker failed:', error);
    };

    worker.onmessage = ({ data }) => {
        const { type } = data;

        if (type === 'detector-ready') {
            detectorReady = true;
            console.info(`AI detector ready with ${data.templateCount} duck sprite templates`);
            startGame();
            return;
        }

        if (type === 'prediction-complete') {
            if (data.requestId === requestId) {
                inferencePending = false;
                captureFrame();
            }
            return;
        }

        if (type === 'predictions' && data.requestId === requestId) {
            const now = performance.now();
            const latency = Math.min(data.inferenceMs, MAX_PREDICTION_MS);
            if (game.level.id !== trackedLevel || game.wave !== trackedWave) {
                previousPredictions = [];
                trackedLevel = game.level.id;
                trackedWave = game.wave;
            }
            const predictions = data.predictions.map((prediction) => ({
                ...prediction,
                x: prediction.x * data.screenWidth / data.frameWidth,
                y: prediction.y * data.screenHeight / data.frameHeight,
                capturedAt: data.capturedAt
            }));
            const movingTargets = [];
            const matchedPrevious = new Set();

            predictions.forEach((prediction) => {
                const previous = previousPredictions
                    .map((candidate, index) => ({
                        candidate,
                        index,
                        age: data.capturedAt - candidate.capturedAt,
                        distance: Math.hypot(
                            prediction.x - candidate.x,
                            prediction.y - candidate.y
                        )
                    }))
                    .filter(({ candidate, index, age, distance }) =>
                        candidate.label === prediction.label &&
                        !matchedPrevious.has(index) &&
                        age > 15 &&
                        age < MAX_TRACK_AGE_MS &&
                        distance < MAX_TRACK_DISTANCE
                    )
                    .sort((first, second) => first.distance - second.distance)[0];

                if (previous) {
                    matchedPrevious.add(previous.index);
                    movingTargets.push({ prediction, previous: previous.candidate });
                } else {
                    movingTargets.push({ prediction, previous: null });
                }
            });

            if (predictions.length) {
                previousPredictions = predictions;
            } else if (previousPredictions.length &&
                data.capturedAt - previousPredictions[0].capturedAt > MAX_TRACK_AGE_MS) {
                previousPredictions = [];
            }

            const predictedTargets = movingTargets.map(({ prediction, previous }) => {
                const targetElapsed = previous ? prediction.capturedAt - previous.capturedAt : 0;
                const velocityX = targetElapsed > 0 && Math.abs(prediction.x - previous.x) > MIN_TRACK_DISTANCE
                    ? Math.max(-MAX_TARGET_SPEED, Math.min(MAX_TARGET_SPEED, (prediction.x - previous.x) / targetElapsed)) : 0;
                const velocityY = targetElapsed > 0 && Math.abs(prediction.y - previous.y) > MIN_TRACK_DISTANCE
                    ? Math.max(-MAX_TARGET_SPEED, Math.min(MAX_TARGET_SPEED, (prediction.y - previous.y) / targetElapsed)) : 0;
                const predictionTime = latency * 0.75;
                const x = prediction.x + velocityX * predictionTime;
                const y = prediction.y + velocityY * predictionTime;

                return {
                    prediction,
                    position: game.stage.toLocal({ x, y }),
                    globalPosition: { x, y }
                };
            }).filter(({ globalPosition }) =>
                globalPosition.x >= 0 &&
                globalPosition.x <= data.screenWidth &&
                globalPosition.y >= 0 &&
                globalPosition.y <= data.screenHeight * 0.92
            );
            if (!predictedTargets.length) return;

            const target = predictedTargets
                .map((candidate) => {
                    const group = predictedTargets.filter((other) =>
                        Math.hypot(
                            candidate.position.x - other.position.x,
                            candidate.position.y - other.position.y
                        ) < game.level.radius
                    );
                    const position = group.reduce((center, member) => ({
                        x: center.x + member.position.x / group.length,
                        y: center.y + member.position.y / group.length
                    }), { x: 0, y: 0 });
                    const ducksInRange = predictedTargets.filter((other) =>
                        Math.hypot(position.x - other.position.x, position.y - other.position.y) < game.level.radius
                    ).length;

                    return {
                        candidate,
                        position,
                        ducksInRange,
                        confidence: group.reduce((total, member) =>
                            total + Number(member.prediction.score), 0)
                    };
                })
                .sort((first, second) =>
                    second.ducksInRange - first.ducksInRange ||
                    second.confidence - first.confidence
                )[0];
            const { prediction } = target.candidate;
            const targetGlobal = game.stage.toGlobal(target.position);
            const targetX = targetGlobal.x;
            const targetY = targetGlobal.y;

            if (targetX < 0 || targetX > data.screenWidth ||
                targetY < 0 || targetY > data.screenHeight * 0.92) return;
            if (now - lastShotAt < SHOT_COOLDOWN_MS) return;
            if (game.bullets === 0 || game.paused || game.stage.hud.replayButton ||
                !game.stage.ducksAlive() || game.shouldWaveEnd()) return;

            const shotPoint = { x: targetX, y: targetY };
            if (game.stage.clickedPauseLink(shotPoint) ||
                game.stage.clickedMuteLink(shotPoint) ||
                game.stage.clickedFullscreenLink(shotPoint) ||
                game.stage.clickedLevelCreatorLink(shotPoint)) return;

            container.updateHUD({ ...prediction, x: targetX, y: targetY });
            game.stage.aim.visible = true;
            game.stage.aim.setPosition(target.position.x, target.position.y);

            game.handleClick({
                global: shotPoint,
            });
            lastShotAt = now;
        }
    };

    return container;
}
