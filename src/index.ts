// Core classes
export {
  ChartPreview,
  type ChartPreviewConfig,
  type ChartPreviewEvents,
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

// Re-export commonly used types from scan-chart for convenience
export {
  type Difficulty,
  type Instrument,
  type InstrumentType,
  getInstrumentType,
  instrumentTypes,
} from "scan-chart";
