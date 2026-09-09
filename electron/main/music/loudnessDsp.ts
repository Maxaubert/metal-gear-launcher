export type MusicLoudness = { lufs: number; peak: number };

type Coefficients = readonly [number, number, number, number, number];
function filter([b0, b1, b2, a1, a2]: Coefficients) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// BS.1770 K weighting: shelf and RLB high pass, bilinear transformed for the
// source sample rate. Parameters follow the libebur128 reference implementation:
// https://github.com/jiixyj/libebur128/blob/master/ebur128/ebur128.c
function kWeighting(sampleRate: number) {
  const k = Math.tan(Math.PI * 1681.974450955533 / sampleRate);
  const q = 0.7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / q + k * k;
  const shelf = filter([(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0,
    (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]);
  const r = Math.tan(Math.PI * 38.13547087602444 / sampleRate);
  const rq = 0.5003270373238773;
  const d = 1 + r / rq + r * r;
  const highPass = filter([1, -2, 1, 2 * (r * r - 1) / d, (1 - r / rq + r * r) / d]);
  return (sample: number) => highPass(shelf(sample));
}

/** Streaming mono/stereo integrated BS.1770 loudness, with sample peak (not true peak). */
export class LoudnessMeter {
  private readonly filters: Array<(sample: number) => number>;
  private readonly step: number;
  private readonly segments = [0, 0, 0, 0];
  private readonly blocks: number[] = [];
  private frames = 0;
  private energy = 0;
  private peak = 0;

  constructor(private readonly sampleRate: number, private readonly channels: number) {
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || (channels !== 1 && channels !== 2)) {
      throw new Error("Unsupported loudness measurement format");
    }
    this.filters = Array.from({ length: channels }, () => kWeighting(sampleRate));
    this.step = Math.round(sampleRate / 10);
  }

  /** Float WAV frames, little endian and interleaved. */
  push(samples: Buffer) {
    if (samples.length % (4 * this.channels)) throw new Error("Incomplete audio frame");
    for (let offset = 0; offset < samples.length;) {
      for (let channel = 0; channel < this.channels; channel++, offset += 4) {
        const value = samples.readFloatLE(offset);
        if (!Number.isFinite(value) || Math.abs(value) > 16) throw new Error("Invalid audio sample");
        this.peak = Math.max(this.peak, Math.abs(value));
        const weighted = this.filters[channel]!(value);
        this.energy += weighted * weighted;
      }
      this.frames++;
      if (this.frames > this.sampleRate * 30 * 60) throw new Error("Music exceeds analysis duration limit");
      if (this.frames % this.step === 0) {
        const segment = this.frames / this.step;
        this.segments[(segment - 1) % 4] = this.energy;
        this.energy = 0;
        if (segment >= 4) this.blocks.push(this.segments.reduce((sum, value) => sum + value, 0) / (4 * this.step));
      }
    }
  }

  finish(): MusicLoudness | undefined {
    const absolute = 10 ** ((-70 + 0.691) / 10);
    const audible = this.blocks.filter(energy => energy > absolute);
    if (!audible.length) return undefined;
    const relative = audible.reduce((sum, value) => sum + value, 0) / audible.length / 10;
    const gated = audible.filter(energy => energy > relative);
    const energy = gated.reduce((sum, value) => sum + value, 0) / gated.length;
    return { lufs: -0.691 + 10 * Math.log10(energy), peak: this.peak };
  }
}

/** Parses only the bounded float WAV format requested from our decoder. */
export class LoudnessWavReader {
  private pending: Buffer = Buffer.alloc(0);
  private meter?: LoudnessMeter;
  private frameBytes = 0;
  private dataBytes = -1;
  private received = 0;
  private header = false;

  push(chunk: Buffer) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    if (!this.header && this.pending.length >= 12) {
      if (this.pending.toString("ascii", 0, 4) !== "RIFF" || this.pending.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid WAV header");
      this.pending = this.pending.subarray(12); this.header = true;
    }
    while (this.header && this.dataBytes < 0 && this.pending.length >= 8) {
      const name = this.pending.toString("ascii", 0, 4);
      const size = this.pending.readUInt32LE(4);
      if (name === "data") {
        if (!this.meter || size > 2 * 1024 ** 3 || size % this.frameBytes) throw new Error("Invalid WAV data");
        this.dataBytes = size; this.pending = this.pending.subarray(8); break;
      }
      if (size > 65536) throw new Error("Oversized WAV header");
      if (this.pending.length < 8 + size + size % 2) return;
      if (name === "fmt ") {
        if (size < 16 || this.pending.readUInt16LE(8) !== 3 || this.pending.readUInt16LE(22) !== 32) throw new Error("Expected float WAV");
        const channels = this.pending.readUInt16LE(10);
        this.frameBytes = channels * 4;
        if (this.pending.readUInt16LE(20) !== this.frameBytes) throw new Error("Invalid WAV frame size");
        this.meter = new LoudnessMeter(this.pending.readUInt32LE(12), channels);
      }
      this.pending = this.pending.subarray(8 + size + size % 2);
    }
    if (this.dataBytes >= 0) {
      const bytes = Math.min(this.pending.length - this.pending.length % this.frameBytes, this.dataBytes - this.received);
      this.meter!.push(this.pending.subarray(0, bytes)); this.received += bytes;
      this.pending = this.pending.subarray(bytes);
      if (this.pending.length > this.frameBytes) throw new Error("Unexpected trailing audio data");
    }
  }

  finish(): MusicLoudness | undefined {
    if (this.dataBytes < 0 || this.received !== this.dataBytes || this.pending.length) throw new Error("Truncated WAV stream");
    return this.meter?.finish();
  }
}
