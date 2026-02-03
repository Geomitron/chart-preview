import { SngStream } from "parse-sng";
import {
  scanChartFolder,
  parseChartFile,
  getInstrumentType,
  type Difficulty,
  type Instrument,
  type ScannedChart,
} from "scan-chart";
import { ChartPreview, type ParsedChart } from "./ChartPreview";

/**
 * Audio file extensions supported by the chart preview.
 */
const AUDIO_EXTENSIONS = [".ogg", ".mp3", ".wav", ".opus"];

/**
 * Audio file names to exclude from playback (preview stems, crowd noise).
 */
const EXCLUDED_AUDIO_NAMES = ["preview", "crowd"];

/**
 * Configuration for loading a chart from a URL.
 */
export interface LoadFromUrlConfig {
  /** URL to the .sng file */
  url: string;
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position as a percentage (0-1). Defaults to 0. */
  initialSeekPercent?: number;
  /** AbortSignal to cancel the fetch operation */
  signal?: AbortSignal;
}

/**
 * Configuration for loading a chart from raw .sng file data.
 */
export interface LoadFromSngFileConfig {
  /** Raw .sng file data */
  sngFile: Uint8Array;
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position as a percentage (0-1). Defaults to 0. */
  initialSeekPercent?: number;
}

/**
 * Configuration for loading a chart from individual chart and audio files.
 */
export interface LoadFromChartFilesConfig {
  /** Array of files with their names and data */
  files: { fileName: string; data: Uint8Array }[];
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position as a percentage (0-1). Defaults to 0. */
  initialSeekPercent?: number;
}

/**
 * Result of preparing chart data for playback.
 */
export interface PreparedChartData {
  parsedChart: ParsedChart;
  textures: Awaited<ReturnType<typeof ChartPreview.loadTextures>>;
  audioFiles: Uint8Array[];
  instrument: Instrument;
  difficulty: Difficulty;
  startDelayMs: number;
  audioLengthMs: number;
  initialSeekPercent: number;
}

/**
 * Extracts files from a .sng archive.
 *
 * @param data - Raw .sng file data
 * @returns Array of extracted files with their names and data
 */
export async function extractSngFile(
  data: Uint8Array
): Promise<{ fileName: string; data: Uint8Array }[]> {
  return new Promise((resolve, reject) => {
    const files: { fileName: string; data: Uint8Array }[] = [];

    // Convert Uint8Array to ReadableStream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const sngStream = new SngStream(stream, { generateSongIni: true });

    sngStream.on("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    sngStream.on("file", async (fileName, fileStream, nextFile) => {
      try {
        // Read the entire file stream into a Uint8Array
        const chunks: Uint8Array[] = [];
        const reader = fileStream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // Combine chunks into a single Uint8Array
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0
        );
        const fileData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          fileData.set(chunk, offset);
          offset += chunk.length;
        }

        files.push({ fileName, data: fileData });

        if (nextFile) {
          nextFile();
        } else {
          resolve(files);
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    sngStream.start();
  });
}

/**
 * Finds the chart file (.chart or .mid) from an array of files.
 * Prefers .mid over .chart when both exist.
 *
 * @param files - Array of files to search
 * @returns The chart file, or null if not found
 */
export function findChartFile(
  files: { fileName: string; data: Uint8Array }[]
): { fileName: string; data: Uint8Array; format: "chart" | "mid" } | null {
  // Look for .mid first (preferred)
  const midFile = files.find((f) => f.fileName.toLowerCase().endsWith(".mid"));
  if (midFile) {
    return { ...midFile, format: "mid" };
  }

  // Fall back to .chart
  const chartFile = files.find((f) =>
    f.fileName.toLowerCase().endsWith(".chart")
  );
  if (chartFile) {
    return { ...chartFile, format: "chart" };
  }

  return null;
}

/**
 * Finds audio files from an array of files, excluding preview and crowd stems.
 *
 * @param files - Array of files to search
 * @returns Array of audio file data
 */
export function findAudioFiles(
  files: { fileName: string; data: Uint8Array }[]
): Uint8Array[] {
  return files
    .filter((file) => {
      const ext = file.fileName
        .toLowerCase()
        .slice(file.fileName.lastIndexOf("."));
      if (!AUDIO_EXTENSIONS.includes(ext)) {
        return false;
      }

      // Exclude preview and crowd audio files
      const baseName =
        file.fileName
          .toLowerCase()
          .replace(/\.[^/.]+$/, "")
          .split("/")
          .pop() || "";
      return !EXCLUDED_AUDIO_NAMES.some((excluded) =>
        baseName.includes(excluded)
      );
    })
    .map((file) => file.data);
}

/**
 * Checks if a filename is a video file (to be excluded from .sng extraction).
 */
export function isVideoFile(fileName: string): boolean {
  const videoExtensions = [".mp4", ".avi", ".webm", ".ogv", ".mpeg"];
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return videoExtensions.includes(ext);
}

/**
 * Prepares chart data for playback by extracting, parsing, and loading all resources.
 *
 * @param files - Array of extracted files
 * @param instrument - The instrument to display
 * @param difficulty - The difficulty level to display
 * @param initialSeekPercent - Initial seek position (0-1)
 * @returns Prepared chart data ready for the player
 */
export async function prepareChartData(
  files: { fileName: string; data: Uint8Array }[],
  instrument: Instrument,
  difficulty: Difficulty,
  initialSeekPercent = 0
): Promise<PreparedChartData> {
  // Filter out video files
  const filteredFiles = files.filter((f) => !isVideoFile(f.fileName));

  // Scan the chart folder to get metadata and modifiers
  const scannedChart: ScannedChart = scanChartFolder(filteredFiles);

  if (!scannedChart.playable || !scannedChart.notesData) {
    throw new Error("This chart has no playable tracks.");
  }

  // Find the chart file
  const chartFile = findChartFile(filteredFiles);
  if (!chartFile) {
    throw new Error("No .chart or .mid file found in the chart.");
  }

  // Build chart modifiers from scanned chart
  const modifiers = {
    song_length: scannedChart.song_length || 0,
    hopo_frequency: scannedChart.hopo_frequency || 0,
    eighthnote_hopo: scannedChart.eighthnote_hopo || false,
    multiplier_note: scannedChart.multiplier_note || 0,
    sustain_cutoff_threshold: scannedChart.sustain_cutoff_threshold ?? -1,
    chord_snap_threshold: scannedChart.chord_snap_threshold || 0,
    five_lane_drums: scannedChart.five_lane_drums || false,
    pro_drums: scannedChart.pro_drums || false,
  };

  // Parse the chart
  const parsedChart = parseChartFile(
    chartFile.data,
    chartFile.format,
    modifiers
  );

  // Verify the requested track exists
  const track = parsedChart.trackData.find(
    (t) => t.instrument === instrument && t.difficulty === difficulty
  );
  if (!track) {
    throw new Error(
      `No ${difficulty} ${instrument} track found in this chart.`
    );
  }

  // Find audio files
  const audioFiles = findAudioFiles(filteredFiles);

  // Load textures for the instrument type
  const instrumentType = getInstrumentType(instrument);
  const textures = await ChartPreview.loadTextures(instrumentType);

  // Calculate audio length from the last note or from metadata
  const lastNote = parsedChart.trackData
    .flatMap((t) => t.noteEventGroups.flat())
    .reduce((max, note) => Math.max(max, note.msTime + note.msLength), 0);
  const audioLengthMs = scannedChart.song_length || lastNote + 5000;

  // Calculate start delay from chart metadata
  const startDelayMs =
    (scannedChart.delay || 0) + (scannedChart.chart_offset || 0) * 1000;

  // Calculate initial seek position from preview_start_time if not explicitly provided
  const seekPercent =
    initialSeekPercent > 0
      ? initialSeekPercent
      : scannedChart.preview_start_time
      ? scannedChart.preview_start_time / audioLengthMs
      : 0;

  return {
    parsedChart,
    textures,
    audioFiles,
    instrument,
    difficulty,
    startDelayMs,
    audioLengthMs,
    initialSeekPercent: seekPercent,
  };
}

/**
 * Fetches a .sng file from a URL.
 *
 * @param url - URL to fetch the .sng file from
 * @param signal - Optional AbortSignal to cancel the fetch
 * @returns Raw .sng file data
 */
export async function fetchSngFile(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch chart: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
