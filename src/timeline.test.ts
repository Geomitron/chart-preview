import { describe, expect, it } from "vitest";
import {
  getInitialSeekPercent,
  timelineChartTimeMs,
  timelineDurationMs,
  timelineElapsedMs,
  timelineProgress,
} from "./timeline";

// Ho Hey: the audio is 4.31 s in at chart time 0 and lasts 200 s.
const audioFirst = { chartStartTimeMs: -4310, chartEndTimeMs: 195_690, audioLengthMs: 200_000 };
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
  const startDelayMs = -4310;
  it.each([
    { name: "preview start", options: { previewStartAudioMs: 100_000 }, expected: 0.5 },
    { name: "preview start at the audio's start", options: { previewStartAudioMs: 0 }, expected: 0 },
    { name: "initialSeekPercent wins", options: { initialSeekPercent: 0.25, previewStartAudioMs: 100_000 }, expected: 0.25 },
    { name: "initialSeekPercent of 0 defers", options: { initialSeekPercent: 0, previewStartAudioMs: 100_000 }, expected: 0.5 },
    { name: "nothing set", options: {}, expected: 0 },
    { name: "after the timeline", options: { previewStartAudioMs: 300_000 }, expected: 1 },
  ])("$name", ({ options, expected }) => {
    expect(getInitialSeekPercent(audioFirst, { startDelayMs, ...options })).toBeCloseTo(expected, 12);
  });

  it("applies the 20-second rule to the decoded audio length", () => {
    // No song_length and a last note at 10 s give a 15 s estimate, but the
    // decoded audio is 3 minutes long, so the preview starts 20 s in.
    const preview = { chartStartTimeMs: 0, chartEndTimeMs: 180_000, audioLengthMs: 180_000 };
    expect(
      getInitialSeekPercent(preview, { startDelayMs: 0, previewStartAudioMs: 20_000 })
    ).toBeCloseTo(20_000 / 180_000, 12);
  });

  it("starts audio shorter than 20 seconds at its beginning", () => {
    const preview = { chartStartTimeMs: 0, chartEndTimeMs: 19_000, audioLengthMs: 19_000 };
    expect(getInitialSeekPercent(preview, { startDelayMs: 0, previewStartAudioMs: 5000 })).toBe(0);
  });
});
