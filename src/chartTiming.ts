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
  /**
   * Audio position, in milliseconds, where playback starts by default when
   * the audio is at least 20 seconds long. Pass it to `getPreviewStartMs()`
   * with the decoded audio length.
   */
  previewStartAudioMs: number;
}

/** Audio position used when a chart sets no preview start. */
const DEFAULT_PREVIEW_START_MS = 20_000;
/** Audio shorter than this always previews from its start. */
const MIN_AUDIO_FOR_PREVIEW_START_MS = 20_000;

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
 *   unset or -1, the preview starts 20 seconds into the audio.
 *
 * @param metadata The chart's metadata from scan-chart's `scanChartFolder`,
 * with `songIniDelay` from `readSongIniDelay()`.
 */
export function getChartTiming(metadata: ChartTimingMetadata): ChartTiming {
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
  const previewStartAudioMs =
    previewStart === -1
      ? DEFAULT_PREVIEW_START_MS
      : Number.isInteger(previewStart)
      ? previewStart
      : roundedUpSecondsToMs(previewStart / 1000);

  return { startDelayMs, previewStartAudioMs };
}

/**
 * Returns the chart time, in milliseconds, where playback starts by default.
 * Audio shorter than 20 seconds always previews from its start.
 *
 * @param audioLengthMs The length of the decoded audio in milliseconds.
 */
export function getPreviewStartMs(
  timing: ChartTiming,
  audioLengthMs: number
): number {
  const audioMs =
    audioLengthMs < MIN_AUDIO_FOR_PREVIEW_START_MS
      ? 0
      : timing.previewStartAudioMs;
  return timing.startDelayMs + audioMs;
}

/**
 * Returns the `delay` value of the chart's song.ini as written, or undefined
 * when there is no song.ini or it sets no `delay`. When the key repeats, the
 * last value counts.
 */
export function readSongIniDelay(
  files: { fileName: string; data: Uint8Array }[]
): string | undefined {
  return readSongIniSection(files).get("delay");
}

/**
 * Reads the `[song]` section of the chart's song.ini into a map of lowercase
 * keys to trimmed values. Comment lines start with `#` or `;`, a section
 * header is a whole line in brackets, and a repeated key keeps its last value.
 */
function readSongIniSection(
  files: { fileName: string; data: Uint8Array }[]
): Map<string, string> {
  const values = new Map<string, string>();
  const songIni = files.find(
    (file) => file.fileName.split("/").pop()?.toLowerCase() === "song.ini"
  );
  if (!songIni) return values;

  let section = "";
  for (const rawLine of new TextDecoder().decode(songIni.data).split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1 || section !== "song") continue;
    values.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim()
    );
  }
  return values;
}

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;
const DECIMAL_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Parses a whole number in the 32-bit integer range, or returns undefined. */
function parseInt32(text: string) {
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value >= INT32_MIN && value <= INT32_MAX ? value : undefined;
}

/**
 * Reads a song.ini `delay`: whole milliseconds, or seconds with a decimal
 * point. Anything else, or a result outside the 32-bit integer range, is 0.
 */
function songIniDelayToMs(text: string) {
  if (text.includes(".")) {
    if (!DECIMAL_NUMBER.test(text)) return 0;
    const ms = truncatedSecondsToMs(Number(text));
    return ms >= INT32_MIN && ms <= INT32_MAX ? ms : 0;
  }
  return parseInt32(text) ?? 0;
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
