// Runs on the audio thread: turns microphone sound into 16 kHz pieces of
// 100 ms for Nova's ears, plus a loudness number for the listening glow.
class NovaMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000; // e.g. 3 input samples per output sample at 48 kHz
    this.acc = 0; this.sum = 0; this.cnt = 0;
    this.out = new Float32Array(1600); this.n = 0; this.loud = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // average each group of input samples into one output sample
      this.sum += ch[i]; this.cnt++; this.acc += 1;
      if (this.acc >= this.step) {
        const v = this.sum / this.cnt;
        this.out[this.n++] = v; this.loud += v * v;
        this.acc -= this.step; this.sum = 0; this.cnt = 0;
        if (this.n === this.out.length) {
          this.port.postMessage({ samples: this.out.slice(0), level: Math.sqrt(this.loud / this.n) });
          this.n = 0; this.loud = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('nova-mic', NovaMic);
