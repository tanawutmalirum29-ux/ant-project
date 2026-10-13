/* Page zoom guard: map canvas retains U1 pointer/pinch and wheel zoom handlers.
   UI is a full-viewport game; avoid web-page zoom shortcuts and iOS gestures. */
(() => {
  const canvas = document.getElementById('game-canvas');
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && !canvas?.contains(event.target)) {
      event.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('wheel', event => {
    if ((event.ctrlKey || event.metaKey) && !canvas?.contains(event.target)) {
      event.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (['+', '=', '-', '_', '0', 'Add', 'Subtract'].includes(event.key)) {
      event.preventDefault();
    }
  });
})();
