import { scanChartFolder } from "scan-chart";
import { describe, expect, it } from "vitest";
import {
  getChartTiming,
  getPreviewStartMs,
  type ChartFolderFile,
} from "./chartTiming";

const LONG_AUDIO_MS = 200_000;
const encoder = new TextEncoder();

/** A playable .chart whose [Song] section has the given lines. */
function chartFile(songLines: string[], fileName = "notes.chart"): ChartFolderFile {
  return {
    fileName,
    data: encoder.encode(
      [
        "[Song]",
        "{",
        '  Name = "Test"',
        ...songLines.map((line) => `  ${line}`),
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
  };
}

function songIni(lines: string[]): ChartFolderFile {
  return {
    fileName: "song.ini",
    data: encoder.encode(["[song]", "name = Test", ...lines].join("\r\n")),
  };
}

const midiChart: ChartFolderFile = { fileName: "notes.mid", data: new Uint8Array() };

const audio: ChartFolderFile = { fileName: "song.ogg", data: new Uint8Array(4) };

/** Computes the timing of a chart folder that scan-chart accepts as playable. */
function timingOf(files: ChartFolderFile[]) {
  if (files.some((file) => file.fileName.endsWith(".chart")) && !files.includes(midiChart)) {
    expect(scanChartFolder([...files, audio]).playable).toBe(true);
  }
  return getChartTiming([...files, audio]);
}

describe("getChartTiming start delay", () => {
  it.each([
    { name: "no delay or Offset", files: [chartFile([])], expected: 0 },
    { name: "no chart files", files: [], expected: 0 },
    { name: "positive delay", files: [chartFile([]), songIni(["delay = 4310"])], expected: -4310 },
    { name: "negative delay", files: [chartFile([]), songIni(["delay = -2000"])], expected: 2000 },
    { name: "fractional delay is seconds", files: [chartFile([]), songIni(["delay = 0.33"])], expected: -330 },
    { name: "negative fractional delay", files: [chartFile([]), songIni(["delay = -1.5"])], expected: 1500 },
    { name: "fractional delay truncates", files: [chartFile([]), songIni(["delay = 0.0019"])], expected: -1 },
    { name: "delay with a decimal point is seconds", files: [chartFile([]), songIni(["delay = 4310.0"])], expected: -4_310_000 },
    { name: "unreadable delay", files: [chartFile([]), songIni(["delay = abc"])], expected: 0 },
    { name: "largest 32-bit delay", files: [chartFile([]), songIni(["delay = 2147483647"])], expected: -2147483647 },
    { name: "smallest 32-bit delay", files: [chartFile([]), songIni(["delay = -2147483648"])], expected: 2147483648 },
    { name: "delay above the 32-bit range", files: [chartFile([]), songIni(["delay = 2147483648"])], expected: 0 },
    { name: "delay below the 32-bit range", files: [chartFile([]), songIni(["delay = -2147483649"])], expected: 0 },
    { name: "seconds above the 32-bit range", files: [chartFile([]), songIni(["delay = 3000000.0"])], expected: 0 },
    { name: "malformed seconds", files: [chartFile([]), songIni(["delay = 1.2.3"])], expected: 0 },
    { name: ".chart Offset without song.ini", files: [chartFile(["Offset = 0.33"])], expected: -330 },
    { name: "negative .chart Offset", files: [chartFile(["Offset = -0.5"])], expected: 500 },
    { name: ".chart Offset rounds up", files: [chartFile(["Offset = 0.0004"])], expected: -1 },
    { name: "negative .chart Offset rounds up", files: [chartFile(["Offset = -0.0014"])], expected: 1 },
    { name: "quoted .chart Offset", files: [chartFile(['Offset = "0.25"'])], expected: -250 },
    { name: "first nonzero .chart Offset", files: [chartFile(["Offset = 0", "Offset = 0.25", "Offset = 0.5"])], expected: -250 },
    { name: ".chart Offset with song.ini lacking delay", files: [chartFile(["Offset = 0.33"]), songIni([])], expected: -330 },
    { name: "song.ini delay wins over .chart Offset", files: [chartFile(["Offset = 0.33"]), songIni(["delay = 4310"])], expected: -4310 },
    { name: "negative delay wins over .chart Offset", files: [chartFile(["Offset = 0.33"]), songIni(["delay = -100"])], expected: 100 },
    { name: "fractional delay wins over .chart Offset", files: [chartFile(["Offset = 0.5"]), songIni(["delay = 0.25"])], expected: -250 },
    { name: "song.ini delay of 0 uses .chart Offset", files: [chartFile(["Offset = 0.33"]), songIni(["delay = 0"])], expected: -330 },
    { name: "empty delay uses .chart Offset", files: [chartFile(["Offset = 0.5"]), songIni(["delay ="])], expected: -500 },
    { name: "unreadable delay uses .chart Offset", files: [chartFile(["Offset = 0.5"]), songIni(["delay = abc"])], expected: -500 },
    { name: "repeated delay uses the last", files: [chartFile([]), songIni(["delay = 100", "delay = 4310"])], expected: -4310 },
    { name: "repeated delay ending in 0 uses .chart Offset", files: [chartFile(["Offset = 0.33"]), songIni(["delay = 4310", "delay = 0"])], expected: -330 },
    { name: "commented-out delay", files: [chartFile([]), songIni(["delay = 4310", "; delay = 100", "# delay = 200"])], expected: -4310 },
    { name: "delay in another section", files: [chartFile([]), songIni(["delay = 4310", "[other]", "delay = 100"])], expected: -4310 },
    { name: "unclosed bracket is not a section", files: [chartFile([]), songIni(["[other", "delay = 4310"])], expected: -4310 },
    { name: "MIDI chart ignores a .chart Offset", files: [midiChart, chartFile(["Offset = 0.33"])], expected: 0 },
    { name: "MIDI chart with delay", files: [midiChart, songIni(["delay = 4310"])], expected: -4310 },
  ])("$name", ({ files, expected }) => {
    expect(timingOf(files).startDelayMs).toBe(expected);
  });
});

describe("getChartTiming preview start", () => {
  it.each([
    // The cases from the release review.
    { name: "PreviewStart 0 without song.ini", files: [chartFile(["PreviewStart = 0"])], expected: 0 },
    { name: "PreviewStart 0, song.ini without the key", files: [chartFile(["PreviewStart = 0"]), songIni([])], expected: 0 },
    { name: "PreviewStart 12.5, song.ini without the key", files: [chartFile(["PreviewStart = 12.5"]), songIni([])], expected: 12_500 },
    { name: "PreviewStart 12.5, song.ini set to -1", files: [chartFile(["PreviewStart = 12.5"]), songIni(["preview_start_time = -1"])], expected: 12_500 },
    { name: "fractional preview_start_time", files: [chartFile([]), songIni(["preview_start_time = 12345.6"])], expected: 20_000 },
    // Further cases.
    { name: "preview_start_time", files: [chartFile([]), songIni(["preview_start_time = 30000"])], expected: 30_000 },
    { name: "preview_start_time of 0", files: [chartFile([]), songIni(["preview_start_time = 0"])], expected: 0 },
    { name: "preview_start_time wins over PreviewStart", files: [chartFile(["PreviewStart = 12.5"]), songIni(["preview_start_time = 30000"])], expected: 30_000 },
    { name: "fractional preview_start_time uses PreviewStart", files: [chartFile(["PreviewStart = 12.5"]), songIni(["preview_start_time = 12345.6"])], expected: 12_500 },
    { name: "preview_start_time outside the 32-bit range", files: [chartFile([]), songIni(["preview_start_time = 2147483648"])], expected: 20_000 },
    { name: "repeated preview_start_time uses the last", files: [chartFile([]), songIni(["preview_start_time = 1000", "preview_start_time = 30000"])], expected: 30_000 },
    { name: "PreviewStart rounds up", files: [chartFile(["PreviewStart = 12.3454"])], expected: 12_346 },
    { name: "quoted PreviewStart", files: [chartFile(['PreviewStart = "12.5"'])], expected: 12_500 },
    { name: "first PreviewStart", files: [chartFile(["PreviewStart = 0", "PreviewStart = 12.5"])], expected: 0 },
    { name: "empty PreviewStart", files: [chartFile(["PreviewStart = ", "PreviewStart = 12.5"])], expected: 12_500 },
    { name: "unreadable PreviewStart", files: [chartFile(["PreviewStart = soon", "PreviewStart = 12.5"])], expected: 20_000 },
    { name: "PreviewStart key is case-sensitive", files: [chartFile(["previewstart = 12.5"])], expected: 20_000 },
    { name: "nothing set", files: [chartFile([])], expected: 20_000 },
    { name: "MIDI chart ignores a .chart PreviewStart", files: [midiChart, chartFile(["PreviewStart = 12.5"])], expected: 20_000 },
  ])("$name", ({ files, expected }) => {
    expect(timingOf(files).previewStartAudioMs).toBe(expected);
  });

  it("stops reading the .chart at an unreadable PreviewStart", () => {
    const timing = timingOf([chartFile(["PreviewStart = soon", "Offset = 0.5"])]);
    expect(timing).toEqual({ startDelayMs: 0, previewStartAudioMs: 20_000 });
  });

  it("places the preview start on the chart's timeline", () => {
    const timing = timingOf([chartFile([]), songIni(["delay = 4310", "preview_start_time = 30000"])]);
    expect(getPreviewStartMs(timing, LONG_AUDIO_MS)).toBe(30_000 - 4310);
    const later = timingOf([chartFile([]), songIni(["delay = -2000", "preview_start_time = 30000"])]);
    expect(getPreviewStartMs(later, LONG_AUDIO_MS)).toBe(32_000);
  });

  it("starts audio shorter than 20 seconds at the audio's start", () => {
    for (const preview of ["5000", "-1"]) {
      const timing = timingOf([chartFile([]), songIni(["delay = 1000", `preview_start_time = ${preview}`])]);
      expect(getPreviewStartMs(timing, 19_999)).toBe(-1000);
      expect(getPreviewStartMs(timing, 20_000)).toBe(-1000 + (preview === "5000" ? 5000 : 20_000));
    }
  });
});
