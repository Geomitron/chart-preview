/** A file in a chart folder. */
export interface ChartFolderFile {
  fileName: string;
  data: Uint8Array;
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
/** A preview start of -1 means "not set". */
const UNSET_PREVIEW_START = -1;

/**
 * Computes where a chart's audio and default preview start sit on its
 * timeline, the way Clone Hero does. It reads the song.ini `[song]` section
 * and, unless the chart is a .mid, the .chart `[Song]` section.
 *
 * - The song.ini `delay` is the audio position, in milliseconds, at chart
 *   time 0. A value written with a decimal point is in seconds, truncated to
 *   whole milliseconds. Anything else, or a value outside the 32-bit integer
 *   range, counts as 0.
 * - The .chart `Offset` is in seconds, rounded up to whole milliseconds. It
 *   applies only when `delay` is 0 or can't be read; the two are never added.
 * - The song.ini `preview_start_time` is an audio position in milliseconds.
 *   When it is missing, -1 or not a whole number, the .chart `PreviewStart`
 *   (in seconds, rounded up to whole milliseconds; 0 counts) is used. When
 *   neither is set, the preview starts 20 seconds into the audio.
 *
 * @param files The files in the chart's folder, or extracted from its .sng.
 */
export function getChartTiming(files: ChartFolderFile[]): ChartTiming {
  const songIni = readSongIniSection(files);
  const delayText = songIni.get("delay");
  let audioOffsetMs = delayText === undefined ? 0 : songIniDelayToMs(delayText);
  let previewStart =
    parseInt32(songIni.get("preview_start_time") ?? "") ?? UNSET_PREVIEW_START;

  for (const [key, value] of readChartSongSection(files)) {
    if (key === "Offset") {
      if (audioOffsetMs === 0 && DECIMAL_NUMBER.test(value)) {
        audioOffsetMs = roundedUpSecondsToMs(Number(value));
      }
    } else if (key === "PreviewStart") {
      if (previewStart === UNSET_PREVIEW_START) {
        // Clone Hero stops reading the .chart at an unreadable PreviewStart.
        if (!DECIMAL_NUMBER.test(value)) break;
        previewStart = roundedUpSecondsToMs(Number(value));
      }
    }
  }

  return {
    startDelayMs: 0 - audioOffsetMs,
    previewStartAudioMs:
      previewStart === UNSET_PREVIEW_START
        ? DEFAULT_PREVIEW_START_MS
        : previewStart,
  };
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

function fileNamed(files: ChartFolderFile[], extension: string) {
  return files.find((file) => file.fileName.toLowerCase().endsWith(extension));
}

/**
 * Reads the `[song]` section of the chart's song.ini into a map of lowercase
 * keys to trimmed values. Comment lines start with `#` or `;`, a section
 * header is a whole line in brackets, and a repeated key keeps its last value.
 */
function readSongIniSection(files: ChartFolderFile[]): Map<string, string> {
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

/**
 * Reads the key-value pairs of a .chart's first section, in order, with
 * surrounding quotes removed from values. Returns nothing for a .mid chart,
 * whose .chart (if any) the game ignores.
 */
function readChartSongSection(files: ChartFolderFile[]): [string, string][] {
  if (fileNamed(files, ".mid")) return [];
  const chart = fileNamed(files, ".chart");
  if (!chart) return [];

  const text = new TextDecoder().decode(chart.data);
  const start = text.indexOf("{");
  if (start === -1) return [];

  const pairs: [string, string][] = [];
  for (const rawLine of text.slice(start + 1).split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("}")) break;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = withoutOuterQuotes(line.slice(separator + 1).trim()).trim();
    if (value === "") continue;
    // A section named like a tempo track is not a song section.
    if (key === "Name" && (value === "TEMPO TRACK" || value === "midi_export")) {
      break;
    }
    pairs.push([key, value]);
  }
  return pairs;
}

/** Removes a leading and a trailing double quote, if present. */
function withoutOuterQuotes(value: string) {
  let result = value;
  if (result.startsWith('"')) result = result.slice(1);
  if (result.endsWith('"') && result.length > 0) result = result.slice(0, -1);
  return result;
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
