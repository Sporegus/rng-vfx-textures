// Nova's approved hologram idle (art/idle/idle.webm: your MP4 with the navy
// background keyed out, her art untouched), on a loop.
//
// It plays as a <video> element placed over her spot. That's the cheap path:
// drawing the video into a canvas every frame cost about 500 MB more memory
// (measured, bench/results), so it isn't done. Grabbing her and clicking through
// empty space use a small silhouette mask (the union of every frame), not pixel reads.
// Size and placement match every other look: head at HEAD_TOP, feet on GROUND.
// No mouth movement: she has no voice yet, and the idle isn't lip-synced.
(function (root) {
  const META = { width: 330, height: 718, feetY: 703, headY: 14, centerX: 164 };
  const PAD = { x: 0, top: 0 };
  let video = null, mask = null, box = null, lastCss = '';
  function load() {
    if (video || typeof document === 'undefined') return;
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto', poster: '../art/idle/idle-poster.png' });
    video.disablePictureInPicture = true;
    video.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0;';
    video.src = '../art/idle/idle.webm';
    video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true });
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      mask = { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data };   // ~0.2 MB, read once
    };
    img.src = '../art/idle/idle-mask.png';
  }
  // put her video inside Nova's element, sized for this scale (x,y: her sprite box's top-left in that element)
  function show(container, { x = 0, y = 0, scale = 3, W = 48, GROUND = 78, HEAD_TOP = 4 } = {}) {
    load();
    if (video.parentNode !== container) { container.append(video); video.play().catch(() => {}); }
    const k = (GROUND - HEAD_TOP) * scale / (META.feetY - META.headY);
    const left = x + (W * scale) / 2 - META.centerX * k, top = y + GROUND * scale - META.feetY * k;
    box = { left, top, w: META.width * k, h: META.height * k };
    const css = `${Math.round(box.w)}x${Math.round(box.h)}@${left.toFixed(1)},${top.toFixed(1)}`;
    if (css !== lastCss) {   // only touch the DOM when her size changes
      lastCss = css;
      video.style.width = box.w + 'px'; video.style.height = box.h + 'px';
      video.style.left = left + 'px'; video.style.top = top + 'px';
    }
  }
  // another look was picked: stop decoding and free the video's memory
  function hide() {
    if (!video) return;
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    video = null; lastCss = '';
  }
  // is (px, py), relative to her element, on her? (silhouette of all frames)
  function hit(px, py) {
    if (!box) return false;
    const u = (px - box.left) / box.w, v = (py - box.top) / box.h;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    if (!mask) return true;   // mask still loading: inside her box counts
    const mx = Math.floor(u * mask.w), my = Math.floor(v * mask.h);
    return mask.data[(my * mask.w + mx) * 4] > 127;
  }
  // canvas drawing (only used where a video element isn't available, e.g. an exported still)
  function draw(ctx, { x = 0, y = 0, scale = 3, W = 48, GROUND = 78, HEAD_TOP = 4 } = {}) {
    load();
    const k = (GROUND - HEAD_TOP) * scale / (META.feetY - META.headY);
    const src = video && video.readyState >= 2 ? video : null;
    if (src) ctx.drawImage(src, x + (W * scale) / 2 - META.centerX * k, y + GROUND * scale - META.feetY * k, META.width * k, META.height * k);
  }
  const time = () => (video ? video.currentTime : 0);
  root.NovaIdle = { show, hide, hit, draw, PAD, META, time, playing: () => !!(video && !video.paused && video.readyState >= 2) };
})(typeof window !== 'undefined' ? window : globalThis);
