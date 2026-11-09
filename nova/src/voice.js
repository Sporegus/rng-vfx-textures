// Microphone in and voice out for Nova's page. The thinking happens in the
// voice service; this only moves sound around.
window.NovaVoiceIO = (function () {
  let mic = null; // { ctx, stream, node, deviceId, label }
  let muted = false, micLvl = 0, onLost = null, taps = new Set();

  // the microphones Windows offers (names appear once mic access was allowed)
  async function listMics() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Default microphone' : 'Microphone'), group: d.groupId }));
  }
  // calls onAudio(samples16k, level) every 100 ms while the mic is on.
  // deviceId: the microphone you picked (null = Windows' default)
  async function startMic(onAudio, { deviceId = null } = {}) {
    if (mic) return true;
    const want = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...want, deviceId: { exact: deviceId } } : want }); }
    catch (e) {
      // the picked mic is gone: say so, don't silently use another one
      if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) throw Object.assign(new Error('Your chosen microphone isn\'t connected.'), { code: 'missing' });
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw Object.assign(new Error('Microphone access is blocked (Windows Settings > Privacy > Microphone).'), { code: 'denied' });
      throw Object.assign(new Error('I can\'t reach a microphone.'), { code: 'none' });
    }
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule('mic-worklet.js');
    const node = new AudioWorkletNode(ctx, 'nova-mic');
    node.port.onmessage = (e) => { micLvl = e.data.level; for (const t of taps) t(e.data.samples, e.data.level); if (!muted) onAudio(e.data.samples, e.data.level); };
    ctx.createMediaStreamSource(stream).connect(node);
    const track = stream.getAudioTracks()[0];
    // unplugged (or taken away) while listening
    track.addEventListener('ended', () => { stopMic(); if (onLost) onLost(); });
    mic = { ctx, stream, node, deviceId, label: track.label };
    return true;
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach(t => t.stop());
    mic.ctx.close();
    mic = null; micLvl = 0;
  }
  // record a few seconds from the chosen mic (for the test in her Voice menu); nothing is saved
  async function testRecording(ms, { deviceId = null } = {}) {
    const was = !!mic, chunks = [];
    let peak = 0;
    if (!was) await startMic(() => {}, { deviceId });
    const tap = (s, l) => { chunks.push(s); peak = Math.max(peak, l); };
    taps.add(tap);
    await new Promise(r => setTimeout(r, ms));
    taps.delete(tap);
    if (!was) stopMic();
    const n = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    return { samples: all, peak };
  }

  // ---------------------------------------------------------------- her voice
  let out = null, next = 0, analyser = null, level = new Uint8Array(256);
  const playing = new Set();
  let onIdle = null, unmuteTimer = null;
  // plays a piece of speech after whatever is already queued. pitch above 1
  // makes her voice higher (the service already slowed it down to match).
  function play(samples, rate, pitch = 1, gain = 1) {
    if (!out) { out = new AudioContext(); analyser = out.createAnalyser(); analyser.fftSize = 256; analyser.connect(out.destination); }
    if (out.state === 'suspended') out.resume();
    const buf = out.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples, 0);
    const src = out.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    // a short fade in when speech starts, so it doesn't click; pieces that carry
    // straight on from the last one join without one (the natural voice sends many small pieces)
    const at0 = Math.max(out.currentTime + 0.03, next), dur = samples.length / rate / pitch;
    const joined = next > 0 && at0 - next < 0.002;
    const g = out.createGain();
    if (joined) g.gain.setValueAtTime(gain, at0);
    else { g.gain.setValueAtTime(0, at0); g.gain.linearRampToValueAtTime(gain, at0 + 0.008); }
    src.connect(g); g.connect(analyser);
    src.start(at0);
    next = at0 + dur;
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
    startMic, stopMic, play, stop, loudness, listMics, testRecording,
    setMuted(v) { muted = !!v; }, get muted() { return muted; }, get micLevel() { return micLvl; }, get micLabel() { return mic ? mic.label : null; },
    set onLost(fn) { onLost = fn; },
    get micOn() { return !!mic; },
    get talking() { return playing.size > 0; },
    set onIdle(fn) { onIdle = fn; },
  };
})();
