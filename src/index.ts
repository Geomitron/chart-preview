// Core classes
export {
  ChartPreview,
  areAnimationsSupported,
  type ChartPreviewConfig,
  type ChartPreviewEvents,
  type LoadTexturesOptions,
  type ParsedChart,
} from "./ChartPreview";

// Web Component player
export {
  ChartPreviewPlayer,
  type ChartPreviewPlayerConfig,
  type PlayerState,
} from "./ChartPreviewPlayer";

// Loader utilities and types (for advanced use cases)
export {
  extractSngFile,
  fetchSngFile,
  prepareChartData,
  findChartFile,
  findAudioFiles,
  isVideoFile,
  type LoadFromUrlConfig,
  type LoadFromSngFileConfig,
  type LoadFromChartFilesConfig,
  type PreparedChartData,
} from "./SngLoader";

// Timing of a chart's audio and preview start
export {
  getChartTiming,
  readSongIniDelay,
  type ChartTiming,
  type ChartTimingMetadata,
} from "./chartTiming";

// Re-export commonly used types from scan-chart for convenience
export {
  type Difficulty,
  type Instrument,
  type InstrumentType,
  getInstrumentType,
  instrumentTypes,
} from "scan-chart";
