export function pcmBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
export function decodePcm(data: string) {
  const binary = atob(data);
  if (binary.length % 2 || binary.length > 4 * 1024 * 1024)
    throw new Error("INVALID_AUDIO");
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}

export class MicrophoneError extends Error {
  constructor(
    readonly code:
      | "MIC_DENIED"
      | "MIC_SYSTEM_BLOCKED"
      | "MIC_NOT_FOUND"
      | "MIC_BUSY"
      | "MIC_UNSUPPORTED"
      | "MIC_AUDIO_FAILED",
  ) {
    super(code);
    this.name = "MicrophoneError";
  }
}

export class LiveAudio {
  readonly context: AudioContext;
  readonly micAnalyser: AnalyserNode;
  readonly outputAnalyser: AnalyserNode;
  private micData: Float32Array<ArrayBuffer>;
  private outData: Float32Array<ArrayBuffer>;
  private stream: MediaStream | null = null;
  private capture: AudioWorkletNode | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private silent: GainNode;
  private output: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private disposed = false;
  private muted = false;
  onDrain: () => void = () => {};
  onMicrophoneEnded: () => void = () => {};

  // Construct and resume synchronously in the user's Talk to SAL gesture.
  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    void this.context.resume().catch(() => {});
    this.micAnalyser = this.context.createAnalyser();
    this.outputAnalyser = this.context.createAnalyser();
    this.micAnalyser.fftSize = this.outputAnalyser.fftSize = 256;
    this.micData = new Float32Array(256);
    this.outData = new Float32Array(256);
    this.silent = this.context.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(this.context.destination);
    this.output = this.context.createGain();
    this.output.connect(this.outputAnalyser);
    this.outputAnalyser.connect(this.context.destination);
  }
  async microphone(onChunk: (data: string) => void) {
    if (!navigator.mediaDevices?.getUserMedia || !this.context.audioWorklet)
      throw new MicrophoneError("MIC_UNSUPPORTED");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      // Site permission can be granted while the browser host or OS denies
      // device capture. Query only after the failed request, preserving the tap.
      let permission: PermissionState | "unknown" = "unknown";
      try {
        const status = await navigator.permissions?.query({
          name: "microphone" as PermissionName,
        });
        permission = status?.state || "unknown";
      } catch {
        // Some supported browsers do not expose microphone permission queries.
      }
      const name = e instanceof Error ? e.name : "UnknownError";
      const systemDenied =
        e instanceof DOMException && /denied by system/i.test(e.message);
      const code =
        name === "NotAllowedError"
          ? permission === "granted" || systemDenied
            ? "MIC_SYSTEM_BLOCKED"
            : "MIC_DENIED"
          : name === "SecurityError"
            ? "MIC_SYSTEM_BLOCKED"
            : name === "NotFoundError"
              ? "MIC_NOT_FOUND"
              : name === "NotReadableError" || name === "AbortError"
                ? "MIC_BUSY"
                : "MIC_AUDIO_FAILED";
      console.warn(
        "[SAL audio]",
        JSON.stringify({ stage: "microphone", code, name, permission }),
      );
      this.close();
      throw new MicrophoneError(code);
    }
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Ended", "AbortError");
    }
    this.stream = stream;
    for (const track of stream.getAudioTracks())
      track.addEventListener("ended", () => {
        if (!this.disposed) this.onMicrophoneEnded();
      });
    try {
      await this.context.audioWorklet.addModule("/sal/pcm-worklet.js");
      if (this.disposed) throw new DOMException("Ended", "AbortError");
      this.capture = new AudioWorkletNode(this.context, "sal-pcm");
      this.capture.onprocessorerror = () => {
        if (!this.disposed) this.onMicrophoneEnded();
      };
      this.capture.port.onmessage = (event) => {
        if (!this.disposed && !this.muted) onChunk(pcmBase64(event.data));
      };
      this.input = this.context.createMediaStreamSource(stream);
      this.input.connect(this.micAnalyser);
      this.input.connect(this.capture);
      this.capture.connect(this.silent);
    } catch (e) {
      console.warn(
        "[SAL audio]",
        JSON.stringify({
          stage: "audio-processing",
          code: "MIC_AUDIO_FAILED",
          name: e instanceof Error ? e.name : "UnknownError",
        }),
      );
      this.close();
      throw new MicrophoneError("MIC_AUDIO_FAILED");
    }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  play(data: string, mimeType = "audio/pcm;rate=24000") {
    if (this.disposed) return;
    const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
    if (rate < 8000 || rate > 96000 || !mimeType.startsWith("audio/pcm"))
      throw new Error("INVALID_AUDIO");
    const samples = decodePcm(data);
    if (!samples.length) return;
    const buffer = this.context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    const start = Math.max(this.context.currentTime + 0.025, this.nextTime);
    if (start - this.context.currentTime > 45) throw new Error("AUDIO_BACKLOG");
    this.nextTime = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size && !this.disposed) this.onDrain();
    };
    source.start(start);
  }
  get playing() {
    return this.sources.size > 0;
  }
  interrupt() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.sources.clear();
    this.nextTime = 0;
  }
  levels() {
    if (this.disposed) return { user: 0, sal: 0 };
    this.micAnalyser.getFloatTimeDomainData(this.micData);
    this.outputAnalyser.getFloatTimeDomainData(this.outData);
    const rms = (data: Float32Array) =>
      Math.min(
        1,
        Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length) * 5,
      );
    return { user: this.muted ? 0 : rms(this.micData), sal: rms(this.outData) };
  }
  close() {
    if (this.disposed) return;
    this.disposed = true;
    this.interrupt();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.capture) {
      this.capture.port.onmessage = null;
      this.capture.port.close();
      this.capture.disconnect();
    }
    this.input?.disconnect();
    this.micAnalyser.disconnect();
    this.outputAnalyser.disconnect();
    this.output.disconnect();
    this.silent.disconnect();
    void this.context.close().catch(() => {});
  }
}
