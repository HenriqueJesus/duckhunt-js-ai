module.exports.pointDistance = function(point1, point2) {
  return Math.sqrt(
    (Math.pow((point1.x - point2.x), 2) + Math.pow((point1.y - point2.y), 2))
  );
};

module.exports.directionOfTravel = function(pointStart, pointEnd) {
  const rise = pointEnd.y - pointStart.y;
  const run = pointEnd.x - pointStart.x;
  const horizontal = run < 0 ? 'left' : 'right';
  const vertical = rise < 0 ? 'top' : 'bottom';

  if (run !== 0 && Math.abs(rise / run) < 0.3) return horizontal;
  return `${vertical}-${horizontal}`;
};

module.exports.toggleFullscreen = function() {
  const doc = window.document;
  const docEl = doc.documentElement;

  const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen ||
    docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
  const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen ||
    doc.webkitExitFullscreen || doc.msExitFullscreen;

  if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
    requestFullScreen.call(docEl);
  }
  else {
    cancelFullScreen.call(doc);
  }
};