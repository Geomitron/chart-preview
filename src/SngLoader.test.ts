import { describe, expect, it, vi } from "vitest";

// Texture loading needs a browser; the loader's timing does not.
vi.mock("./ChartPreview", () => ({
  ChartPreview: { loadTextures: async () => ({}) },
}));

const { prepareChartData } = await import("./SngLoader");

const encoder = new TextEncoder();

function chartFolder(songIniLines: string[]) {
  return [
    {
      fileName: "notes.chart",
      data: encoder.encode(
        [
          "[Song]",
          "{",
          '  Name = "Test"',
          "  Offset = 0.5",
          "  Resolution = 192",
          "}",
          "[SyncTrack]",
          "{",
          "  0 = TS 4",
          "  0 = B 120000",
          "}",
          "[ExpertSingle]",
          "{",
          "  768 = N 0 0",
          "}",
        ].join("\r\n")
      ),
    },
    {
      fileName: "song.ini",
      data: encoder.encode(["[song]", "name = Test", ...songIniLines].join("\r\n")),
    },
    { fileName: "song.ogg", data: new Uint8Array(16) },
  ];
}

describe("prepareChartData timing", () => {
  it("reads a song.ini delay with a decimal point as seconds", async () => {
    const prepared = await prepareChartData(
      chartFolder(["delay = 0.33"]),
      "guitar",
      "expert"
    );
    expect(prepared.startDelayMs).toBe(-330);
  });

  it("returns the song.ini preview start and the caller's seek percent", async () => {
    const prepared = await prepareChartData(
      chartFolder(["preview_start_time = 30000"]),
      "guitar",
      "expert",
      0.25
    );
    expect(prepared.previewStartAudioMs).toBe(30_000);
    expect(prepared.initialSeekPercent).toBe(0.25);
  });

  it("uses the .chart Offset when song.ini sets no delay", async () => {
    const prepared = await prepareChartData(chartFolder([]), "guitar", "expert");
    expect(prepared.startDelayMs).toBe(-500);
  });
});
