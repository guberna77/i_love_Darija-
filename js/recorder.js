// Capture du micro en 16 kHz et découpage en fragments aux pauses du professeur.

const RATE = 16000;
const MIN_S = 6;      // fragment minimum
const MAX_S = 20;     // fragment maximum (coupé même sans pause)
const PAUSE_S = 0.7;  // durée de silence qui termine un fragment

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("tap", Tap);
`;

const rms = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / (a.length || 1));
};

export const micSupported = !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);

export class Recorder {
  /** @param {(audio: Float32Array) => void} onChunk */
  constructor(onChunk, onLevel) {
    this.onChunk = onChunk;
    this.onLevel = onLevel;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ sampleRate: RATE });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "tap");
    this.parts = [];
    this.length = 0;
    this.silent = 0;
    this.noise = 0.01; // adaptive noise floor
    this.voiced = 0;
    this.node.port.onmessage = (e) => this._push(e.data);
    this.src.connect(this.node);
  }

  _push(frame) {
    const level = rms(frame);
    this.onLevel?.(level);
    // Slowly track the room's background noise.
    this.noise = level < this.noise ? level : this.noise * 0.999 + level * 0.001;
    const speaking = level > Math.max(0.008, this.noise * 2.5);
    this.parts.push(frame);
    this.length += frame.length;
    if (speaking) { this.silent = 0; this.voiced += frame.length; }
    else this.silent += frame.length;

    const secs = this.length / RATE;
    if ((secs >= MIN_S && this.silent / RATE >= PAUSE_S) || secs >= MAX_S) this._flush();
  }

  _flush() {
    const enoughSpeech = this.voiced / RATE > 1;
    if (this.length && enoughSpeech) {
      const audio = new Float32Array(this.length);
      let o = 0;
      for (const p of this.parts) { audio.set(p, o); o += p.length; }
      this.onChunk(audio);
    }
    this.parts = [];
    this.length = 0;
    this.silent = 0;
    this.voiced = 0;
  }

  async stop() {
    this._flush();
    this.node?.port && (this.node.port.onmessage = null);
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
  }
}
