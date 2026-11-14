import { scanChartFolder } from "scan-chart";
import { describe, expect, it } from "vitest";
import {
  getChartTiming,
  getPreviewStartMs,
  readSongIniDelay,
  type ChartTimingMetadata,
} from "./chartTiming";

const LONG_AUDIO_MS = 200_000;

// Metadata as scan-chart reports it: song.ini `delay` and `preview_start_time`
// rounded to whole numbers, and the .chart `Offset` multiplied by 1000.
// Without a song.ini, scan-chart also copies the .chart `Offset` and
// `PreviewStart` into `delay` and `preview_start_time`. `songIniDelay` is the
// song.ini `delay` as written.
const startDelayCases: {
  name: string;
  metadata: ChartTimingMetadata;
  startDelayMs: number;
}[] = [
  { name: "no delay or offset", metadata: { delay: 0, chart_offset: 0 }, startDelayMs: 0 },
  { name: "missing fields", metadata: {}, startDelayMs: 0 },
  { name: "positive delay", metadata: { delay: 4310, chart_offset: 0 }, startDelayMs: -4310 },
  { name: "negative delay", metadata: { delay: -2000, chart_offset: 0 }, startDelayMs: 2000 },
  { name: "song.ini delay text", metadata: { delay: 4310, songIniDelay: "4310" }, startDelayMs: -4310 },
  { name: "negative song.ini delay text", metadata: { delay: -2000, songIniDelay: "-2000" }, startDelayMs: 2000 },
  { name: "fractional delay is seconds", metadata: { delay: 0, songIniDelay: "0.33" }, startDelayMs: -330 },
  { name: "negative fractional delay", metadata: { delay: -2, songIniDelay: "-1.5" }, startDelayMs: 1500 },
  { name: "fractional delay truncates", metadata: { delay: 0, songIniDelay: "0.0019" }, startDelayMs: -1 },
  { name: "delay with a decimal point is seconds", metadata: { delay: 4310, songIniDelay: "4310.0" }, startDelayMs: -4_310_000 },
  { name: "unreadable delay", metadata: { delay: 0, songIniDelay: "abc" }, startDelayMs: 0 },
  { name: "empty delay uses .chart Offset", metadata: { delay: 0, chart_offset: 500, songIniDelay: "" }, startDelayMs: -500 },
  { name: "fractional delay wins over .chart Offset", metadata: { delay: 0, chart_offset: 500, songIniDelay: "0.25" }, startDelayMs: -250 },
  { name: "positive .chart Offset", metadata: { delay: 0, chart_offset: 0.33 * 1000 }, startDelayMs: -330 },
  { name: "negative .chart Offset", metadata: { delay: 0, chart_offset: -0.5 * 1000 }, startDelayMs: 500 },
  { name: ".chart Offset rounds up", metadata: { delay: 0, chart_offset: 0.0004 * 1000 }, startDelayMs: -1 },
  { name: "negative .chart Offset rounds up", metadata: { delay: 0, chart_offset: -0.0014 * 1000 }, startDelayMs: 1 },
  { name: "delay wins over .chart Offset", metadata: { delay: 100, chart_offset: 0.33 * 1000 }, startDelayMs: -100 },
  { name: "negative delay wins over .chart Offset", metadata: { delay: -100, chart_offset: 0.33 * 1000 }, startDelayMs: 100 },
  {
    name: ".chart without song.ini counts the Offset once",
    metadata: { delay: 0.33 * 1000, chart_offset: 0.33 * 1000 },
    startDelayMs: -330,
  },
  {
    name: ".chart without song.ini, negative Offset",
    metadata: { delay: -1.25 * 1000, chart_offset: -1.25 * 1000 },
    startDelayMs: 1250,
  },
  { name: "MIDI chart with delay", metadata: { delay: 4310, chart_offset: 0 }, startDelayMs: -4310 },
  { name: "MIDI chart without delay", metadata: { delay: 0, chart_offset: 0 }, startDelayMs: 0 },
];

describe("getChartTiming start delay", () => {
  it.each(startDelayCases)("$name", ({ metadata, startDelayMs }) => {
    expect(getChartTiming(metadata).startDelayMs).toBe(startDelayMs);
  });
});

describe("getChartTiming preview start", () => {
  it.each([
    { name: "set", preview: 30_000, delay: 0, expected: 30_000 },
    { name: "set, positive delay", preview: 30_000, delay: 4310, expected: 30_000 - 4310 },
    { name: "set, negative delay", preview: 30_000, delay: -2000, expected: 32_000 },
    { name: "set to 0", preview: 0, delay: 4310, expected: -4310 },
    { name: "missing", preview: undefined, delay: 0, expected: 20_000 },
    { name: "missing, positive delay", preview: undefined, delay: 4310, expected: 20_000 - 4310 },
    { name: "-1", preview: -1, delay: 0, expected: 20_000 },
    { name: "from .chart PreviewStart", preview: 12.345 * 1000, delay: 0, expected: 12_345 },
  ])("$name", ({ preview, delay, expected }) => {
    const timing = getChartTiming({ delay, chart_offset: 0, preview_start_time: preview });
    expect(getPreviewStartMs(timing, LONG_AUDIO_MS)).toBe(expected);
  });

  it("starts audio shorter than 20 seconds at the audio's start", () => {
    for (const preview of [5000, -1, undefined]) {
      const timing = getChartTiming({ delay: 1000, chart_offset: 0, preview_start_time: preview });
      expect(getPreviewStartMs(timing, 19_999)).toBe(-1000);
      expect(getPreviewStartMs(timing, 20_000)).toBe(-1000 + (preview === 5000 ? 5000 : 20_000));
    }
  });
});

describe("getChartTiming with scan-chart output", () => {
  const encoder = new TextEncoder();
  const chartFile = (offset: string) => ({
    fileName: "notes.chart",
    data: encoder.encode(
      [
        "[Song]",
        "{",
        '  Name = "Test"',
        `  Offset = ${offset}`,
        "  Resolution = 192",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = TS 4",
        "  0 = B 120000",
        "}",
        "[ExpertSingle]",
        "{",
        "  0 = N 0 0",
        "}",
      ].join("\r\n")
    ),
  });
  const songIni = (lines: string[]) => ({
    fileName: "song.ini",
    data: encoder.encode(["[song]", "name = Test", ...lines].join("\r\n")),
  });

  it.each([
    { name: ".chart Offset without song.ini", files: [chartFile("0.33")], expected: -330 },
    { name: "negative .chart Offset without song.ini", files: [chartFile("-0.5")], expected: 500 },
    { name: ".chart Offset with song.ini lacking delay", files: [chartFile("0.33"), songIni([])], expected: -330 },
    { name: "song.ini delay with .chart Offset", files: [chartFile("0.33"), songIni(["delay = 4310"])], expected: -4310 },
    { name: "fractional song.ini delay", files: [chartFile("0"), songIni(["delay = 0.33"])], expected: -330 },
    { name: "song.ini delay of 0 with .chart Offset", files: [chartFile("0.33"), songIni(["delay = 0"])], expected: -330 },
  ])("$name", ({ files, expected }) => {
    const scanned = scanChartFolder(files);
    const metadata = { ...scanned, songIniDelay: readSongIniDelay(files) };
    expect(getChartTiming(metadata).startDelayMs).toBe(expected);
  });
});
