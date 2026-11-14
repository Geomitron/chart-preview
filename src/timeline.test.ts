import { describe, expect, it } from "vitest";
import {
  getInitialSeekPercent,
  timelineChartTimeMs,
  timelineDurationMs,
  timelineElapsedMs,
  timelineProgress,
} from "./timeline";

// Ho Hey: the audio is 4.31 s in at chart time 0 and lasts 200 s.
const audioFirst = { chartStartTimeMs: -4310, chartEndTimeMs: 195_690 };
// Audio that starts 2 s after chart time 0 and lasts 200 s.
const audioLater = { chartStartTimeMs: 0, chartEndTimeMs: 202_000 };

describe("timeline math", () => {
  it("measures elapsed time and duration from the timeline's start", () => {
    expect(timelineDurationMs(audioFirst)).toBe(200_000);
    expect(timelineElapsedMs(audioFirst, -4310)).toBe(0);
    expect(timelineElapsedMs(audioFirst, 0)).toBe(4310);
    expect(timelineElapsedMs(audioLater, 2000)).toBe(2000);
  });

  it("reports progress across the whole timeline", () => {
    expect(timelineProgress(audioFirst, -4310)).toBe(0);
    expect(timelineProgress(audioFirst, 95_690)).toBe(0.5);
    expect(timelineProgress(audioFirst, 195_690)).toBe(1);
    expect(timelineProgress(audioLater, 101_000)).toBe(0.5);
  });

  it("maps a seek percentage to chart time", () => {
    expect(timelineChartTimeMs(audioFirst, 0)).toBe(-4310);
    expect(timelineChartTimeMs(audioFirst, 0.5)).toBe(95_690);
    expect(timelineChartTimeMs(audioLater, 1)).toBe(202_000);
  });
});

describe("getInitialSeekPercent", () => {
  it.each([
    { name: "preview start", options: { previewStartMs: 95_690 }, expected: 0.5 },
    { name: "preview start at chart time 0", options: { previewStartMs: 0 }, expected: 4310 / 200_000 },
    { name: "initialSeekPercent wins", options: { initialSeekPercent: 0.25, previewStartMs: 95_690 }, expected: 0.25 },
    { name: "initialSeekPercent of 0 defers", options: { initialSeekPercent: 0, previewStartMs: 95_690 }, expected: 0.5 },
    { name: "nothing set", options: {}, expected: 0 },
    { name: "before the timeline", options: { previewStartMs: -10_000 }, expected: 0 },
    { name: "after the timeline", options: { previewStartMs: 300_000 }, expected: 1 },
  ])("$name", ({ options, expected }) => {
    expect(getInitialSeekPercent(audioFirst, options)).toBeCloseTo(expected, 12);
  });
});
