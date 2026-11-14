import { beforeEach, describe, expect, it, vi } from "vitest";

/** A loaded preview whose audio is 4.31 s in at chart time 0 and lasts 200 s. */
class FakePreview {
  chartStartTimeMs = -4310;
  chartEndTimeMs = 195_690;
  audioLengthMs = 200_000;
  chartCurrentTimeMs = -4310;
  volume = 1;
  seeks: number[] = [];
  handlers: Record<string, (value?: number) => void> = {};

  on(event: string, handler: (value?: number) => void) {
    this.handlers[event] = handler;
  }

  async seek(percent: number) {
    this.seeks.push(percent);
    this.chartCurrentTimeMs = this.chartStartTimeMs + percent * 200_000;
  }

  dispose() {}
}

let preview: FakePreview;

vi.mock("./ChartPreview", () => ({
  ChartPreview: { create: async () => preview },
}));

// The player is a custom element; its timing logic does not need a DOM.
vi.stubGlobal("HTMLElement", class {});
const { ChartPreviewPlayer } = await import("./ChartPreviewPlayer");

type Config = Parameters<InstanceType<typeof ChartPreviewPlayer>["loadChart"]>[0];

/** A player built without the DOM, recording the events it dispatches. */
function createPlayer() {
  const events: CustomEvent[] = [];
  const player = Object.assign(Object.create(ChartPreviewPlayer.prototype), {
    chartPreview: null,
    _volume: 50,
    seekBar: { value: "0", disabled: true },
    viewport: { querySelector: () => ({}) },
    stopTimestampUpdates() {},
    prepareForLoading() {},
    startTimestampUpdates() {},
    setState() {},
    handleLoadError(error: unknown) {
      throw error;
    },
    dispatchEvent(event: CustomEvent) {
      events.push(event);
      return true;
    },
  }) as InstanceType<typeof ChartPreviewPlayer>;
  return { player, events };
}

function load(player: InstanceType<typeof ChartPreviewPlayer>, options: Partial<Config>) {
  return player.loadChart({ startDelayMs: -4310, audioLengthMs: 200_000, ...options } as Config);
}

beforeEach(() => {
  preview = new FakePreview();
});

describe("ChartPreviewPlayer timing", () => {
  it("starts at the preview start, measured across the whole timeline", async () => {
    const { player } = createPlayer();
    await load(player, { previewStartAudioMs: 100_000 });
    expect(preview.seeks).toEqual([0.5]);
  });

  it("lets an initialSeekPercent above 0 override the preview start", async () => {
    const { player } = createPlayer();
    await load(player, { initialSeekPercent: 0.25, previewStartAudioMs: 100_000 });
    expect(preview.seeks).toEqual([0.25]);
  });

  it("counts current time and duration from the timeline's start", async () => {
    const { player } = createPlayer();
    await load(player, {});
    expect(preview.seeks).toEqual([]);
    expect(player.currentTimeMs).toBe(0);
    expect(player.durationMs).toBe(200_000);
  });

  it("reports progress times from the timeline's start", async () => {
    const { player, events } = createPlayer();
    await load(player, {});
    preview.chartCurrentTimeMs = 95_690;
    preview.handlers.progress(0.5);
    expect(events.map((event) => [event.type, event.detail])).toEqual([
      ["player-progress", { percent: 0.5, currentMs: 100_000, totalMs: 200_000 }],
    ]);
  });
});
