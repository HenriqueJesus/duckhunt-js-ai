/******/ (() => { // webpackBootstrap
/*!************************************!*\
  !*** ./machine-learning/worker.js ***!
  \************************************/
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
var COLOR_TOLERANCE = 50;
var MIN_MATCH_RATIO = 0.94;
var COARSE_MATCH_RATIO = 0.7;
var SCAN_STEP = 6;
var REFINE_RADIUS = Math.ceil(SCAN_STEP / 2);
var MAX_SAMPLES = 96;
var MAX_MATCHES_PER_TEMPLATE = 6;
var templates = [];
var frameCanvas;
var frameContext;
function prepareSamples(template) {
  var pixels = new Uint8Array(template.pixels);
  var samples = [];
  var gridSize = 9;
  for (var gridY = 0; gridY < gridSize; gridY++) {
    for (var gridX = 0; gridX < gridSize; gridX++) {
      var minX = Math.max(1, Math.floor(gridX * template.width / gridSize));
      var maxX = Math.min(template.width - 1, Math.floor((gridX + 1) * template.width / gridSize));
      var minY = Math.max(1, Math.floor(gridY * template.height / gridSize));
      var maxY = Math.min(template.height - 1, Math.floor((gridY + 1) * template.height / gridSize));
      var bestSample = null;
      for (var y = minY; y < maxY; y++) {
        var _loop = function _loop() {
            var index = (y * template.width + x) * 4;
            if (pixels[index + 3] < 250) return 0; // continue
            var neighbors = [index - 4, index + 4, index - template.width * 4, index + template.width * 4];
            if (neighbors.some(function (neighbor) {
              return Math.abs(pixels[index] - pixels[neighbor]) > 8 || Math.abs(pixels[index + 1] - pixels[neighbor + 1]) > 8 || Math.abs(pixels[index + 2] - pixels[neighbor + 2]) > 8;
            })) return 0; // continue
            var contrast = Math.max(Math.abs(pixels[index] - 100), Math.abs(pixels[index + 1] - 176), Math.abs(pixels[index + 2] - 255));
            if (!bestSample || contrast > bestSample.contrast) {
              bestSample = {
                x: x,
                y: y,
                red: pixels[index],
                green: pixels[index + 1],
                blue: pixels[index + 2],
                contrast: contrast
              };
            }
          },
          _ret;
        for (var x = minX; x < maxX; x++) {
          _ret = _loop();
          if (_ret === 0) continue;
        }
      }
      if (bestSample) samples.push(bestSample);
    }
  }
  if (samples.length < 12 || samples.length > MAX_SAMPLES) {
    throw new Error("Duck sprite template ".concat(template.name, " has an invalid number of opaque pixels"));
  }
  return {
    name: template.name,
    width: template.width,
    height: template.height,
    samples: samples
  };
}
function colorMatches(frame, frameWidth, x, y, sample) {
  var index = (y * frameWidth + x) * 4;
  return Math.abs(frame[index] - sample.red) <= COLOR_TOLERANCE && Math.abs(frame[index + 1] - sample.green) <= COLOR_TOLERANCE && Math.abs(frame[index + 2] - sample.blue) <= COLOR_TOLERANCE;
}
function addMatch(matches, candidate) {
  var minDistance = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 14;
  var existing = matches.find(function (match) {
    return Math.hypot(match.x - candidate.x, match.y - candidate.y) < minDistance;
  });
  if (existing) {
    if (candidate.score > existing.score) Object.assign(existing, candidate);
    return;
  }
  matches.push(candidate);
  matches.sort(function (first, second) {
    return second.score - first.score;
  });
  if (matches.length > MAX_MATCHES_PER_TEMPLATE) matches.pop();
}
function findTemplateMatches(frame, frameWidth, frameHeight, stageScaleX, stageScaleY) {
  var found = [];
  templates.forEach(function (template) {
    var displayWidth = Math.round(template.width * stageScaleX);
    var displayHeight = Math.round(template.height * stageScaleY);
    var samples = template.samples.map(function (sample) {
      return {
        x: Math.round(sample.x * stageScaleX),
        y: Math.round(sample.y * stageScaleY),
        red: sample.red,
        green: sample.green,
        blue: sample.blue,
        contrast: sample.contrast
      };
    });
    var anchors = _toConsumableArray(samples).sort(function (first, second) {
      return second.contrast - first.contrast;
    }).slice(0, 8);
    var coarseMatches = [];
    for (var top = 0; top <= frameHeight - displayHeight; top += SCAN_STEP) {
      for (var left = 0; left <= frameWidth - displayWidth; left += SCAN_STEP) {
        var anchorMatches = 0;
        var _iterator = _createForOfIteratorHelper(anchors),
          _step;
        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            var sample = _step.value;
            if (colorMatches(frame, frameWidth, left + sample.x, top + sample.y, sample)) {
              anchorMatches++;
            }
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }
        if (anchorMatches < Math.ceil(anchors.length / 2)) continue;
        var matchedSamples = 0;
        var _iterator2 = _createForOfIteratorHelper(samples),
          _step2;
        try {
          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
            var _sample = _step2.value;
            if (colorMatches(frame, frameWidth, left + _sample.x, top + _sample.y, _sample)) {
              matchedSamples++;
            }
          }
        } catch (err) {
          _iterator2.e(err);
        } finally {
          _iterator2.f();
        }
        var score = matchedSamples / samples.length;
        if (score >= COARSE_MATCH_RATIO) {
          addMatch(coarseMatches, {
            left: left,
            top: top,
            x: left + displayWidth / 2,
            y: top + displayHeight / 2,
            score: score
          }, 24);
        }
      }
    }
    coarseMatches.forEach(function (coarse) {
      var bestMatch = null;
      var minTop = Math.max(0, coarse.top - REFINE_RADIUS);
      var maxTop = Math.min(frameHeight - displayHeight, coarse.top + REFINE_RADIUS);
      var minLeft = Math.max(0, coarse.left - REFINE_RADIUS);
      var maxLeft = Math.min(frameWidth - displayWidth, coarse.left + REFINE_RADIUS);
      for (var _top = minTop; _top <= maxTop; _top++) {
        for (var _left = minLeft; _left <= maxLeft; _left++) {
          var _matchedSamples = 0;
          var _iterator3 = _createForOfIteratorHelper(samples),
            _step3;
          try {
            for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
              var _sample2 = _step3.value;
              if (colorMatches(frame, frameWidth, _left + _sample2.x, _top + _sample2.y, _sample2)) {
                _matchedSamples++;
              }
            }
          } catch (err) {
            _iterator3.e(err);
          } finally {
            _iterator3.f();
          }
          var _score = _matchedSamples / samples.length;
          if (_score >= MIN_MATCH_RATIO && (!bestMatch || _score > bestMatch.score)) {
            bestMatch = {
              left: _left,
              top: _top,
              score: _score
            };
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
  found.sort(function (first, second) {
    return second.score - first.score;
  });
  var detections = [];
  var _loop2 = function _loop2() {
    var match = _found[_i];
    if (detections.some(function (detection) {
      return Math.hypot(detection.x - match.x, detection.y - match.y) < 24;
    })) return 1; // continue
    var _match$template$split = match.template.split('/'),
      _match$template$split2 = _slicedToArray(_match$template$split, 3),
      color = _match$template$split2[1],
      direction = _match$template$split2[2];
    detections.push({
      x: match.x,
      y: match.y,
      label: "duck-".concat(color),
      trackKey: "".concat(color, "-").concat(direction),
      score: match.score.toFixed(2)
    });
  };
  for (var _i = 0, _found = found; _i < _found.length; _i++) {
    if (_loop2()) continue;
  }
  return detections;
}
self.onmessage = function (_ref) {
  var data = _ref.data;
  if (data.type === 'initialize') {
    templates = data.templates.map(prepareSamples);
    postMessage({
      type: 'detector-ready',
      templateCount: templates.length
    });
    return;
  }
  if (data.type !== 'predict') return;
  try {
    if (!frameCanvas || frameCanvas.width !== data.image.width || frameCanvas.height !== data.image.height) {
      frameCanvas = new OffscreenCanvas(data.image.width, data.image.height);
      frameContext = frameCanvas.getContext('2d', {
        willReadFrequently: true
      });
    }
    frameContext.drawImage(data.image, 0, 0);
    var imageData = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    var predictions = findTemplateMatches(imageData.data, frameCanvas.width, frameCanvas.height, data.stageScaleX, data.stageScaleY);
    data.image.close();
    postMessage({
      type: 'predictions',
      predictions: predictions,
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
    postMessage({
      type: 'prediction-complete',
      requestId: data.requestId
    });
  }
};
/******/ })()
;
//# sourceMappingURL=machine-learning_worker_js.js.map