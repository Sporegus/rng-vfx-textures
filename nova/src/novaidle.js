// Nova's approved hologram idle (art/idle/idle.webm, the background keyed out,
// her art untouched). It plays on a loop and is drawn into her canvas at the
// same height as every other look: head at HEAD_TOP, feet on GROUND.
// No mouth movement: she has no voice yet, and the idle is not lip-synced.
(function (root) {
  const META = { width: 330, height: 718, feetY: 703, headY: 14, centerX: 164 };
  const PAD = { x: 0, top: 0 };
  let video = null, poster = null, failed = false;
  function ensure() {
    if (video || typeof document === 'undefined') return;
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
    video.src = '../art/idle/idle.webm';
    video.addEventListener('error', () => { failed = true; });
    const go = () => video.play().catch(() => {});
    video.addEventListener('canplay', go, { once: true });
    go();
    poster = new Image();
    poster.src = '../art/idle/idle-poster.png';
  }
  // ctx: her canvas; x,y: the sprite box's top-left; scale: px per sprite unit
  function draw(ctx, { x = 0, y = 0, scale = 3, W = 48, GROUND = 78, HEAD_TOP = 4 } = {}) {
    ensure();
    const k = (GROUND - HEAD_TOP) * scale / (META.feetY - META.headY);
    const src = !failed && video && video.readyState >= 2 ? video : poster && poster.complete && poster.naturalWidth ? poster : null;
    if (!src) return;
    const left = x + (W * scale) / 2 - META.centerX * k, top = y + GROUND * scale - META.feetY * k;
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, left, top, META.width * k, META.height * k);   // (never flipped: her design isn't symmetric)
    ctx.restore();
  }
  // seconds into the loop (for the diagnostics check that she's actually animating)
  const time = () => (video ? video.currentTime : 0);
  root.NovaIdle = { draw, PAD, META, time, playing: () => !!(video && !video.paused && video.readyState >= 2) };
})(typeof window !== 'undefined' ? window : globalThis);
