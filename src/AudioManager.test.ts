import { beforeEach, describe, expect, it, vi } from "vitest";

interface StartCall {
  when: number;
  offset: number;
}

/** Records each `start(when, offset)` call made by the audio manager. */
class FakeAudioContext {
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  state = "running";
  destination = {};
  startCalls: StartCall[] = [];

  constructor(private bufferDurationSeconds: number) {}

  async decodeAudioData() {
    return { duration: this.bufferDurationSeconds };
  }

  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }

  createBufferSource() {
    const calls = this.startCalls;
    return {
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      stop() {},
      start(when: number, offset: number) {
        calls.push({ when, offset });
      },
    };
  }

  async resume() {}
}

let fakeContext: FakeAudioContext;

vi.mock("./SharedAudioContext", () => ({
  getSharedAudioContext: () => fakeContext,
  registerInstance: () => {},
  unregisterInstance: () => {},
  isAudioContextSupported: () => true,
}));

const { AudioManager, ChartPreview, SilentAudioManager } = await import("./ChartPreview");

const AUDIO_SECONDS = 200;
const AUDIO_MS = AUDIO_SECONDS * 1000;

async function createManager(startDelayMs: number) {
  const manager = await AudioManager.create(
    [new Uint8Array(4)],
    startDelayMs,
    AUDIO_MS
  );
  return manager;
}

/** Seeks to `chartTimeMs`, plays, and returns the resulting `start` call. */
async function playFrom(
  manager: Awaited<ReturnType<typeof createManager>>,
  chartTimeMs: number
) {
  const span = manager.chartEndTimeMs - manager.chartStartTimeMs;
  await manager.seek((chartTimeMs - manager.chartStartTimeMs) / span);
  fakeContext.startCalls.length = 0;
  await manager.play();
  await manager.pause();
  return fakeContext.startCalls[0];
}

beforeEach(() => {
  fakeContext = new FakeAudioContext(AUDIO_SECONDS);
  fakeContext.currentTime = 50; // The shared context has been running a while.
});

describe("AudioManager timeline", () => {
  it("starts where the audio starts when the audio is playing at chart time 0", async () => {
    const manager = await createManager(-4310);
    expect(manager.chartStartTimeMs).toBe(-4310);
    expect(manager.chartEndTimeMs).toBe(AUDIO_MS - 4310);
    expect(manager.chartCurrentTimeMs).toBe(-4310);

    fakeContext.startCalls.length = 0;
    await manager.play();
    expect(fakeContext.startCalls).toEqual([{ when: 50, offset: 0 }]);
  });

  it("starts at chart time 0 with a silent lead-in when the audio starts later", async () => {
    const manager = await createManager(2000);
    expect(manager.chartStartTimeMs).toBe(0);
    expect(manager.chartEndTimeMs).toBe(AUDIO_MS + 2000);
    expect(manager.chartCurrentTimeMs).toBe(0);

    fakeContext.startCalls.length = 0;
    await manager.play();
    expect(fakeContext.startCalls).toEqual([{ when: 52, offset: 0 }]);
  });

  it("plays from the start of the audio when there is no delay", async () => {
    const manager = await createManager(0);
    expect(manager.chartStartTimeMs).toBe(0);
    expect(manager.chartEndTimeMs).toBe(AUDIO_MS);

    fakeContext.startCalls.length = 0;
    await manager.play();
    expect(fakeContext.startCalls).toEqual([{ when: 50, offset: 0 }]);
  });

  it.each([
    { name: "audio playing at chart time 0, before chart time 0", startDelayMs: -4310, chartTimeMs: -2310, call: { when: 50, offset: 2 } },
    { name: "audio playing at chart time 0, after chart time 0", startDelayMs: -4310, chartTimeMs: 95_690, call: { when: 50, offset: 100 } },
    { name: "audio starting later, during the lead-in", startDelayMs: 2000, chartTimeMs: 500, call: { when: 51.5, offset: 0 } },
    { name: "audio starting later, after the audio starts", startDelayMs: 2000, chartTimeMs: 5000, call: { when: 50, offset: 3 } },
    { name: "no delay", startDelayMs: 0, chartTimeMs: 60_000, call: { when: 50, offset: 60 } },
  ])("seeks with $name", async ({ startDelayMs, chartTimeMs, call }) => {
    const manager = await createManager(startDelayMs);
    const started = await playFrom(manager, chartTimeMs);
    expect(started.when).toBeCloseTo(call.when, 9);
    expect(started.offset).toBeCloseTo(call.offset, 9);
  });

  it("maps seek percentages across the whole timeline", async () => {
    const manager = await createManager(-4310);
    await manager.seek(0);
    expect(manager.chartCurrentTimeMs).toBe(-4310);
    await manager.seek(1);
    expect(manager.chartCurrentTimeMs).toBe(AUDIO_MS - 4310);
  });

  it("reports the decoded audio length, not the metadata estimate", async () => {
    // No song_length and a last note at 10 s give a 15 s estimate.
    const manager = await AudioManager.create([new Uint8Array(4)], 0, 15_000);
    expect(manager.audioLengthMs).toBe(AUDIO_MS);
    expect(manager.chartEndTimeMs).toBe(AUDIO_MS);
  });
});

describe("ChartPreview progress", () => {
  it("reports how far playback is through the whole timeline", () => {
    const emitted: unknown[][] = [];
    const preview = {
      audioManager: { chartStartTimeMs: -4310, chartEndTimeMs: 195_690, chartCurrentTimeMs: 95_690 },
      lastProgressEmitTime: -Infinity,
      progressIntervalMs: 0,
      eventEmitter: { emit: (...args: unknown[]) => emitted.push(args) },
    };
    const emitProgress = Reflect.get(ChartPreview.prototype, "emitProgress") as () => void;
    emitProgress.call(preview);
    expect(emitted).toEqual([["progress", 0.5]]);
  });
});

describe("SilentAudioManager timeline", () => {
  it.each([
    { startDelayMs: -4310, start: -4310, end: AUDIO_MS - 4310 },
    { startDelayMs: 2000, start: 0, end: AUDIO_MS + 2000 },
    { startDelayMs: 0, start: 0, end: AUDIO_MS },
  ])("spans $start to $end for start delay $startDelayMs", async ({ startDelayMs, start, end }) => {
    const manager = await SilentAudioManager.create(startDelayMs, AUDIO_MS);
    expect(manager.chartStartTimeMs).toBe(start);
    expect(manager.chartEndTimeMs).toBe(end);
    expect(manager.chartCurrentTimeMs).toBe(start);
    await manager.seek(1);
    expect(manager.chartCurrentTimeMs).toBe(end);
  });

  it("restarts from the timeline's start after reaching the end", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const manager = await SilentAudioManager.create(-4310, AUDIO_MS);
      await manager.seek(1);
      await manager.play();
      vi.advanceTimersByTime(1000);
      expect(manager.chartCurrentTimeMs).toBe(-4310 + 1000);
      manager.closeAudio();
    } finally {
      vi.useRealTimers();
    }
  });
});
