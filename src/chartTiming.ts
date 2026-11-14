import type { ScannedChart } from "scan-chart";

/** The chart metadata that places a chart's audio on its timeline. */
export interface ChartTimingMetadata
  extends Pick<ScannedChart, "delay" | "chart_offset" | "preview_start_time"> {
  /**
   * The song.ini `delay` value as written, from `readSongIniDelay()`.
   * scan-chart rounds a fractional `delay` to whole milliseconds, but a
   * fractional `delay` is in seconds, so this text takes precedence.
   */
  songIniDelay?: string;
}

/** Where a chart's audio and default preview start sit on its timeline. */
export interface ChartTiming {
  /**
   * Chart time, in milliseconds, at which the audio's first sample plays.
   * Negative when the audio is already playing at chart time 0.
   */
  startDelayMs: number;
  /** Chart time, in milliseconds, where playback starts by default. */
  previewStartMs: number;
}

/** Audio position used when a chart sets no preview start. */
const DEFAULT_PREVIEW_START_MS = 20_000;

/**
 * Computes where a chart's audio and default preview start sit on its
 * timeline, the way Clone Hero does.
 *
 * - The song.ini `delay` is the audio position, in milliseconds, at chart
 *   time 0. A value written with a decimal point is in seconds, truncated to
 *   whole milliseconds.
 * - The .chart `Offset` is in seconds, rounded up to whole milliseconds. It
 *   applies only when `delay` is unset or 0; the two are never added.
 * - `preview_start_time` is an audio position in milliseconds. When it is
 *   unset or -1, the preview starts 20 seconds into the audio. Audio shorter
 *   than 20 seconds always previews from its start.
 *
 * @param metadata The chart's metadata from scan-chart's `scanChartFolder`,
 * with `songIniDelay` from `readSongIniDelay()`.
 * @param audioLengthMs The length of the chart's audio in milliseconds.
 */
export function getChartTiming(
  metadata: ChartTimingMetadata,
  audioLengthMs: number
): ChartTiming {
  const chartOffsetMs = metadata.chart_offset ?? 0;
  const delay = metadata.delay ?? 0;
  // Without a song.ini, scan-chart copies the .chart Offset into `delay`.
  const delayMs =
    metadata.songIniDelay !== undefined
      ? songIniDelayToMs(metadata.songIniDelay)
      : delay === chartOffsetMs
      ? 0
      : delay;
  const audioOffsetMs =
    delayMs !== 0 ? delayMs : roundedUpSecondsToMs(chartOffsetMs / 1000);
  const startDelayMs = 0 - audioOffsetMs;

  const previewStart = metadata.preview_start_time ?? -1;
  let previewStartAudioMs =
    previewStart === -1
      ? DEFAULT_PREVIEW_START_MS
      : Number.isInteger(previewStart)
      ? previewStart
      : roundedUpSecondsToMs(previewStart / 1000);
  if (audioLengthMs < DEFAULT_PREVIEW_START_MS) {
    previewStartAudioMs = 0;
  }

  return {
    startDelayMs,
    previewStartMs: startDelayMs + previewStartAudioMs,
  };
}

/**
 * Returns the `delay` value of the chart's song.ini as written, or undefined
 * when there is no song.ini or it sets no `delay`.
 */
export function readSongIniDelay(
  files: { fileName: string; data: Uint8Array }[]
): string | undefined {
  const songIni = files.find(
    (file) => file.fileName.split("/").pop()?.toLowerCase() === "song.ini"
  );
  if (!songIni) return undefined;

  let inSongSection = false;
  for (const rawLine of new TextDecoder().decode(songIni.data).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inSongSection = line.toLowerCase() === "[song]";
    } else if (inSongSection) {
      const separator = line.indexOf("=");
      if (
        separator !== -1 &&
        line.slice(0, separator).trim().toLowerCase() === "delay"
      ) {
        return line.slice(separator + 1).trim();
      }
    }
  }
  return undefined;
}

/** Reads a song.ini `delay`: whole milliseconds, or seconds with a decimal point. */
function songIniDelayToMs(text: string) {
  if (text.includes(".")) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? truncatedSecondsToMs(seconds) : 0;
  }
  return /^[+-]?\d+$/.test(text) ? Number(text) : 0;
}

// Clone Hero converts seconds to milliseconds in single precision, so a value
// such as 0.33 s becomes exactly 330 ms rather than 330.00000000000006.
function singlePrecisionMs(seconds: number) {
  return Math.fround(Math.fround(seconds) * 1000);
}

function truncatedSecondsToMs(seconds: number) {
  return Math.trunc(singlePrecisionMs(seconds));
}

function roundedUpSecondsToMs(seconds: number) {
  return Math.ceil(singlePrecisionMs(seconds));
}
