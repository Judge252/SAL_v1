import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { decodePcm, pcmBase64 } from "../lib/audio/live-audio";
import { mergeTranscript, voiceTransition } from "../lib/sal/voice-state";
import { liveToolInput, liveTurnsInput } from "../lib/sal/live-validation";
import { parseLiveToolResult } from "../lib/validation/live-tool-result";

test("actual worklet preserves phase and emits exactly 16k mono PCM samples from 48k and 44.1k input", () => {
  const source = readFileSync("public/sal/pcm-worklet.js", "utf8").replace(
    "export class",
    "class",
  );
  for (const rate of [48000, 44100, 16000]) {
    let Processor: new () => { process(input: Float32Array[][]): boolean };
    const chunks: ArrayBuffer[] = [];
    runInNewContext(source, {
      AudioWorkletProcessor: class {
        port = {
          postMessage: (data: ArrayBuffer) =>
            chunks.push(structuredClone(data, { transfer: [data] })),
        };
      },
      registerProcessor: (_: string, cls: typeof Processor) => {
        Processor = cls;
      },
      sampleRate: rate,
      Int16Array,
      Float32Array,
      Math,
    });
    const processor = new Processor!();
    for (let offset = 0; offset < rate; offset += 128) {
      const input = new Float32Array(Math.min(128, rate - offset)).fill(0.5);
      assert.equal(processor.process([[input]]), true);
    }
    assert.equal(chunks.length, 10);
    assert.equal(
      chunks.reduce((sum, b) => sum + b.byteLength / 2, 0),
      16000,
    );
    assert.ok(
      chunks.every((b) =>
        new Int16Array(b).every((n) => Math.abs(n - 16384) <= 1),
      ),
    );
  }
});
test("worklet downmixes opposite stereo channels to silence", () => {
  const source = readFileSync("public/sal/pcm-worklet.js", "utf8").replace(
    "export class",
    "class",
  );
  let Processor: new () => { process(input: Float32Array[][]): boolean };
  const chunks: ArrayBuffer[] = [];
  runInNewContext(source, {
    AudioWorkletProcessor: class {
      port = {
        postMessage: (data: ArrayBuffer) =>
          chunks.push(structuredClone(data, { transfer: [data] })),
      };
    },
    registerProcessor: (_: string, cls: typeof Processor) => {
      Processor = cls;
    },
    sampleRate: 16000,
    Int16Array,
    Float32Array,
    Math,
  });
  new Processor!().process([
    [new Float32Array(1600).fill(0.8), new Float32Array(1600).fill(-0.8)],
  ]);
  assert.equal(chunks.length, 1);
  assert.ok(new Int16Array(chunks[0]).every((n) => n === 0));
});
test("playback decodes signed little-endian PCM and rejects corrupt bytes", () => {
  const bytes = new Uint8Array([0, 128, 0, 0, 255, 127]);
  assert.deepEqual(
    [...decodePcm(pcmBase64(bytes.buffer))],
    [-1, 0, 32767 / 32768],
  );
  assert.throws(() => decodePcm(btoa("x")), /INVALID_AUDIO/);
});
test("voice state transitions preserve mute and recommendation state after playback/interruptions", () => {
  assert.equal(voiceTransition("idle", "connect"), "connecting");
  assert.equal(voiceTransition("connecting", "connected"), "listening");
  assert.equal(voiceTransition("thinking", "audio"), "speaking");
  assert.equal(voiceTransition("speaking", "interrupt"), "listening");
  assert.equal(voiceTransition("speaking", "complete", true), "muted");
  assert.equal(
    voiceTransition("speaking", "complete", false, true),
    "recommendation",
  );
  assert.equal(voiceTransition("listening", "fail"), "error");
  assert.equal(voiceTransition("error", "connect"), "connecting");
  assert.equal(voiceTransition("speaking", "end"), "ended");
});
test("transcripts merge deltas and cumulative hypotheses without duplicate full turns", () => {
  assert.equal(mergeTranscript("I have", " a headache."), "I have a headache.");
  assert.equal(
    mergeTranscript("I have", "I have a headache."),
    "I have a headache.",
  );
  assert.equal(mergeTranscript("Hello.", "Hello."), "Hello.");
  assert.equal(mergeTranscript("", "أهلاً"), "أهلاً");
});
test("Live tool validation rejects unknown functions, fabricated IDs and extra privileged arguments", () => {
  const base = {
    sessionId: "61a307a8-2a36-4cdd-b77d-5b06df709f88",
    locale: "en",
  };
  assert.equal(
    liveToolInput.safeParse({
      ...base,
      call: {
        name: "find_doctors",
        args: { specialty: "general-practice", language: "English" },
      },
    }).success,
    true,
  );
  assert.equal(
    liveToolInput.safeParse({
      ...base,
      call: { name: "delete_users", args: {} },
    }).success,
    false,
  );
  assert.equal(
    liveToolInput.safeParse({
      ...base,
      call: { name: "get_doctor_details", args: { doctorId: "made-up" } },
    }).success,
    false,
  );
  assert.equal(
    liveToolInput.safeParse({
      ...base,
      call: {
        name: "find_doctors",
        args: { specialty: "general-practice", serviceRole: true },
      },
    }).success,
    false,
  );
});
test("transcript persistence accepts finalized bounded turns only", () => {
  const base = {
    sessionId: "61a307a8-2a36-4cdd-b77d-5b06df709f88",
    locale: "ar",
  };
  const turn = {
    requestId: "91a307a8-2a36-4cdd-b77d-5b06df709f88",
    role: "user",
    content: "أشعر بصداع",
  };
  assert.equal(
    liveTurnsInput.safeParse({ ...base, turns: [turn] }).success,
    true,
  );
  assert.equal(
    liveTurnsInput.safeParse({
      ...base,
      turns: [{ ...turn, audio: "raw bytes" }],
    }).success,
    false,
  );
  assert.equal(
    liveTurnsInput.safeParse({ ...base, turns: Array(5).fill(turn) }).success,
    false,
  );
});
test("malformed successful tool responses cannot create fabricated cards or availability", () => {
  assert.deepEqual(parseLiveToolResult({ doctors: [], availability: {} }), {
    doctors: [],
    availability: {},
  });
  assert.throws(
    () =>
      parseLiveToolResult({
        doctors: [{ id: "made-up", name: "Invented doctor" }],
      }),
    /DIRECTORY_UNAVAILABLE/,
  );
  assert.throws(
    () =>
      parseLiveToolResult({
        doctors: [],
        availability: {
          "61a307a8-2a36-4cdd-b77d-5b06df709f88": [{ start_at: "tomorrow" }],
        },
      }),
    /DIRECTORY_UNAVAILABLE/,
  );
});
