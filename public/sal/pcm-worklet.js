/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// A streaming box-filter resampler. The fractional phase survives render blocks.
// PCM buffers leave the worklet every 100ms; no audio recordings are created.
export class PcmResampler {
  constructor(inputRate, outputRate = 16000, blockSize = 1600) {
    this.ratio = inputRate / outputRate;
    this.remaining = this.ratio;
    this.sum = 0;
    this.position = 0;
    this.buffer = new Int16Array(blockSize);
  }
  push(input, emit) {
    for (const sample of input) {
      let weight = 1;
      while (weight > 1e-8) {
        const used = Math.min(weight, this.remaining);
        this.sum += sample * used;
        this.remaining -= used;
        weight -= used;
        if (this.remaining < 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.buffer[this.position++] = Math.round(
            value * (value < 0 ? 32768 : 32767),
          );
          this.remaining = this.ratio;
          this.sum = 0;
          if (this.position === this.buffer.length) {
            const complete = this.buffer.buffer;
            this.buffer = new Int16Array(this.buffer.length);
            this.position = 0;
            emit(complete);
          }
        }
      }
    }
  }
}
class SalPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = new PcmResampler(sampleRate);
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.[0]) {
      const mono =
        channels.length === 1
          ? channels[0]
          : new Float32Array(channels[0].length);
      if (channels.length > 1) {
        for (let i = 0; i < mono.length; i++) {
          for (const channel of channels)
            mono[i] += channel[i] / channels.length;
        }
      }
      this.resampler.push(mono, (data) => this.port.postMessage(data, [data]));
    }
    return true;
  }
}
registerProcessor("sal-pcm", SalPcmProcessor);
