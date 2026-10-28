// Microphone in and voice out for Zin's page. The thinking happens in the
// voice service; this only moves sound around.
window.ZinVoiceIO = (function () {
  let mic = null; // { ctx, stream, node }
  let muted = false;

  // calls onAudio(samples16k, level) every 100 ms while the mic is on
  async function startMic(onAudio) {
    if (mic) return true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule('mic-worklet.js');
    const node = new AudioWorkletNode(ctx, 'zin-mic');
    node.port.onmessage = (e) => { if (!muted) onAudio(e.data.samples, e.data.level); };
    ctx.createMediaStreamSource(stream).connect(node);
    mic = { ctx, stream, node };
    return true;
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach(t => t.stop());
    mic.ctx.close();
    mic = null;
  }

  // ---------------------------------------------------------------- her voice
  let out = null, next = 0, analyser = null, level = new Uint8Array(256);
  const playing = new Set();
  let onIdle = null, unmuteTimer = null;
  // plays a piece of speech after whatever is already queued. pitch above 1
  // makes her voice higher (the service already slowed it down to match).
  function play(samples, rate, pitch = 1) {
    if (!out) { out = new AudioContext(); analyser = out.createAnalyser(); analyser.fftSize = 256; analyser.connect(out.destination); }
    if (out.state === 'suspended') out.resume();
    const buf = out.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples, 0);
    const src = out.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    src.connect(analyser);
    const at = Math.max(out.currentTime + 0.03, next);
    src.start(at);
    next = at + samples.length / rate / pitch;
    playing.add(src);
    // don't listen to herself while she talks
    muted = true; clearTimeout(unmuteTimer);
    src.onended = () => {
      playing.delete(src);
      if (!playing.size) { unmuteTimer = setTimeout(() => { muted = false; }, 350); if (onIdle) onIdle(); }
    };
  }
  function stop() {
    for (const s of playing) { try { s.stop(); } catch {} }
    playing.clear(); next = 0;
    unmuteTimer = setTimeout(() => { muted = false; }, 200);
  }
  // how loud she is right now, 0..1 (for her mouth)
  function loudness() {
    if (!analyser || !playing.size) return 0;
    analyser.getByteTimeDomainData(level);
    let s = 0; for (const v of level) s += (v - 128) * (v - 128);
    return Math.min(1, Math.sqrt(s / level.length) / 40);
  }

  return {
    startMic, stopMic, play, stop, loudness,
    get micOn() { return !!mic; },
    get talking() { return playing.size > 0; },
    set onIdle(fn) { onIdle = fn; },
  };
})();
