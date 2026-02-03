import {
  ChartPreview,
  ChartPreviewPlayer,
  extractSngFile,
  getInstrumentType,
  type Difficulty,
  type Instrument,
} from "../src";
import { parseChartFile, scanChartFolder, type ScannedChart } from "scan-chart";

// LocalStorage keys
const STORAGE_KEY_LAST_CHART = "chartPreview_lastChart";
const STORAGE_KEY_LAST_INSTRUMENT = "chartPreview_lastInstrument";
const STORAGE_KEY_LAST_DIFFICULTY = "chartPreview_lastDifficulty";

// Instrument display names
const instrumentNames: Record<Instrument, string> = {
  guitar: "Lead Guitar",
  guitarcoop: "Co-op Guitar",
  rhythm: "Rhythm Guitar",
  bass: "Bass Guitar",
  drums: "Drums",
  keys: "Keys",
  guitarghl: "GHL Guitar",
  guitarcoopghl: "GHL Co-op Guitar",
  rhythmghl: "GHL Rhythm Guitar",
  bassghl: "GHL Bass",
};

const difficultyNames: Record<Difficulty, string> = {
  expert: "Expert",
  hard: "Hard",
  medium: "Medium",
  easy: "Easy",
};

// DOM elements
const chooseFolderBtn = document.getElementById(
  "choose-folder-btn"
) as HTMLButtonElement;
const chooseSngBtn = document.getElementById(
  "choose-sng-btn"
) as HTMLButtonElement;
const folderInput = document.getElementById("folder-input") as HTMLInputElement;
const sngInput = document.getElementById("sng-input") as HTMLInputElement;
const lastChartHint = document.getElementById(
  "last-chart-hint"
) as HTMLDivElement;
const lastChartName = document.getElementById(
  "last-chart-name"
) as HTMLSpanElement;
const chartInfoEl = document.getElementById("chart-info") as HTMLDivElement;
const songNameEl = document.getElementById("song-name") as HTMLParagraphElement;
const songArtistEl = document.getElementById(
  "song-artist"
) as HTMLParagraphElement;
const songCharterEl = document.getElementById(
  "song-charter"
) as HTMLParagraphElement;
const songLengthEl = document.getElementById(
  "song-length"
) as HTMLParagraphElement;
const trackOptionsEl = document.getElementById(
  "track-options"
) as HTMLDivElement;
const instrumentSelect = document.getElementById(
  "instrument"
) as HTMLSelectElement;
const difficultySelect = document.getElementById(
  "difficulty"
) as HTMLSelectElement;
const loadBtn = document.getElementById("load-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const playerEventsEl = document.getElementById(
  "player-events"
) as HTMLDivElement;

// Get the Web Component player
const player = document.getElementById("player") as ChartPreviewPlayer;

// State
let currentChartFiles: { fileName: string; data: Uint8Array }[] = [];
let currentScannedChart: ScannedChart | null = null;
let currentChartName = "";

// Available tracks from the scanned chart
interface AvailableTrack {
  instrument: Instrument;
  difficulties: Difficulty[];
}
let availableTracks: AvailableTrack[] = [];

// Log player events
function logEvent(type: string, detail?: unknown) {
  const eventEl = document.createElement("div");
  eventEl.className = `event ${type}`;
  const time = new Date().toLocaleTimeString();
  eventEl.textContent = `[${time}] ${type}${
    detail ? `: ${JSON.stringify(detail)}` : ""
  }`;
  playerEventsEl.insertBefore(eventEl, playerEventsEl.firstChild);
  // Keep only last 20 events
  while (playerEventsEl.children.length > 20) {
    playerEventsEl.removeChild(playerEventsEl.lastChild!);
  }
}

// Setup player event listeners
player.addEventListener("player-statechange", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  logEvent("state", detail);
});

player.addEventListener("player-progress", (e: Event) => {
  // Only log every ~10%
  const detail = (e as CustomEvent).detail;
  if (
    Math.round(detail.percent * 10) % 1 === 0 &&
    Math.round(detail.percent * 100) % 10 === 0
  ) {
    logEvent("progress", { percent: Math.round(detail.percent * 100) + "%" });
  }
});

player.addEventListener("player-end", () => {
  logEvent("end");
});

player.addEventListener("player-error", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  logEvent("error", detail.error?.message || "Unknown error");
});

// Initialize: Show last chart hint if available
function initializeLastChartHint() {
  const lastChart = localStorage.getItem(STORAGE_KEY_LAST_CHART);
  if (lastChart) {
    lastChartName.textContent = lastChart;
    lastChartHint.classList.add("visible");
  }
}
initializeLastChartHint();

// Button click handlers
chooseFolderBtn.addEventListener("click", () => folderInput.click());
chooseSngBtn.addEventListener("click", () => sngInput.click());

// Folder selection
folderInput.addEventListener("change", async () => {
  const files = folderInput.files;
  if (!files || files.length === 0) return;

  setStatus("Reading chart folder...");

  try {
    // Convert FileList to our format
    const chartFiles: { fileName: string; data: Uint8Array }[] = [];

    // Get the folder name from the first file's path
    const firstFilePath = files[0].webkitRelativePath;
    const folderName = firstFilePath.split("/")[0];

    for (const file of files) {
      // Get relative path within the folder
      const relativePath = file.webkitRelativePath
        .split("/")
        .slice(1)
        .join("/");
      if (!relativePath) continue; // Skip if it's the folder itself

      const data = new Uint8Array(await file.arrayBuffer());
      chartFiles.push({ fileName: relativePath, data });
    }

    await processChartFiles(chartFiles, folderName);
  } catch (error) {
    console.error("Error reading folder:", error);
    setStatus(
      `Error: ${
        error instanceof Error ? error.message : "Failed to read folder"
      }`,
      true
    );
  }
});

// .sng file selection
sngInput.addEventListener("change", async () => {
  const file = sngInput.files?.[0];
  if (!file) return;

  setStatus("Reading .sng file...");

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const chartFiles = await extractSngFile(data);
    const chartName = file.name.replace(/\.sng$/i, "");
    await processChartFiles(chartFiles, chartName);
  } catch (error) {
    console.error("Error reading .sng file:", error);
    setStatus(
      `Error: ${
        error instanceof Error ? error.message : "Failed to read .sng file"
      }`,
      true
    );
  }
});

// Process chart files (from folder or .sng)
async function processChartFiles(
  files: { fileName: string; data: Uint8Array }[],
  chartName: string
) {
  try {
    setStatus("Scanning chart...");

    // Store for later use
    currentChartFiles = files;
    currentChartName = chartName;

    // Scan the chart folder
    currentScannedChart = scanChartFolder(files);

    if (!currentScannedChart.playable || !currentScannedChart.notesData) {
      setStatus("This chart has no playable tracks.", true);
      return;
    }

    // Extract available tracks
    availableTracks = [];
    const instruments = currentScannedChart.notesData.instruments;
    const noteCounts = currentScannedChart.notesData.noteCounts;

    for (const instrument of instruments) {
      const difficulties = noteCounts
        .filter((nc) => nc.instrument === instrument && nc.count > 0)
        .map((nc) => nc.difficulty);

      if (difficulties.length > 0) {
        availableTracks.push({ instrument, difficulties });
      }
    }

    if (availableTracks.length === 0) {
      setStatus("No tracks with notes found in this chart.", true);
      return;
    }

    // Update UI
    updateChartInfo(currentScannedChart);
    populateInstrumentSelect();

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY_LAST_CHART, chartName);
    lastChartName.textContent = chartName;
    lastChartHint.classList.add("visible");

    // Try to restore last used instrument/difficulty
    const lastInstrument = localStorage.getItem(STORAGE_KEY_LAST_INSTRUMENT);
    const lastDifficulty = localStorage.getItem(STORAGE_KEY_LAST_DIFFICULTY);

    if (
      lastInstrument &&
      availableTracks.some((t) => t.instrument === lastInstrument)
    ) {
      instrumentSelect.value = lastInstrument;
      populateDifficultySelect();

      const track = availableTracks.find(
        (t) => t.instrument === lastInstrument
      );
      if (
        lastDifficulty &&
        track?.difficulties.includes(lastDifficulty as Difficulty)
      ) {
        difficultySelect.value = lastDifficulty;
      }
    }

    updateLoadButtonState();
    setStatus(
      `Loaded: ${chartName} - ${availableTracks.length} instrument(s) available`,
      false,
      true
    );
  } catch (error) {
    console.error("Error processing chart:", error);
    setStatus(
      `Error: ${
        error instanceof Error ? error.message : "Failed to process chart"
      }`,
      true
    );
  }
}

// Update chart info display
function updateChartInfo(chart: ScannedChart) {
  songNameEl.textContent = chart.name || currentChartName || "Unknown Song";
  songArtistEl.textContent = chart.artist || "Unknown Artist";
  songCharterEl.textContent = chart.charter ? `Charter: ${chart.charter}` : "";

  if (chart.song_length) {
    const minutes = Math.floor(chart.song_length / 60000);
    const seconds = Math.floor((chart.song_length % 60000) / 1000);
    songLengthEl.textContent = `Length: ${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  } else {
    songLengthEl.textContent = "";
  }

  chartInfoEl.classList.add("visible");
  trackOptionsEl.classList.add("visible");
}

// Populate instrument dropdown
function populateInstrumentSelect() {
  instrumentSelect.innerHTML = "";

  for (const track of availableTracks) {
    const option = document.createElement("option");
    option.value = track.instrument;
    option.textContent = instrumentNames[track.instrument] || track.instrument;
    instrumentSelect.appendChild(option);
  }

  instrumentSelect.disabled = false;
  populateDifficultySelect();
}

// Populate difficulty dropdown based on selected instrument
function populateDifficultySelect() {
  const selectedInstrument = instrumentSelect.value as Instrument;
  const track = availableTracks.find(
    (t) => t.instrument === selectedInstrument
  );

  difficultySelect.innerHTML = "";

  if (track) {
    // Sort difficulties: expert, hard, medium, easy
    const sortOrder: Difficulty[] = ["expert", "hard", "medium", "easy"];
    const sortedDifficulties = track.difficulties.sort(
      (a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b)
    );

    for (const difficulty of sortedDifficulties) {
      const option = document.createElement("option");
      option.value = difficulty;
      option.textContent = difficultyNames[difficulty] || difficulty;
      difficultySelect.appendChild(option);
    }
    difficultySelect.disabled = false;
  } else {
    difficultySelect.disabled = true;
  }

  updateLoadButtonState();
}

// Update load button state
function updateLoadButtonState() {
  loadBtn.disabled =
    !instrumentSelect.value ||
    !difficultySelect.value ||
    currentChartFiles.length === 0;
}

// Instrument selection change
instrumentSelect.addEventListener("change", () => {
  populateDifficultySelect();
  localStorage.setItem(STORAGE_KEY_LAST_INSTRUMENT, instrumentSelect.value);
});

// Difficulty selection change
difficultySelect.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEY_LAST_DIFFICULTY, difficultySelect.value);
  updateLoadButtonState();
});

// Load preview
loadBtn.addEventListener("click", async () => {
  if (currentChartFiles.length === 0 || !currentScannedChart) {
    setStatus("Please select a chart first.", true);
    return;
  }

  const instrument = instrumentSelect.value as Instrument;
  const difficulty = difficultySelect.value as Difficulty;

  if (!instrument || !difficulty) {
    setStatus("Please select an instrument and difficulty.", true);
    return;
  }

  try {
    setStatus("Loading chart preview...");
    loadBtn.disabled = true;

    // Dispose previous player state
    player.dispose();

    // Find chart file
    const chartFile = currentChartFiles.find(
      (f) =>
        f.fileName.toLowerCase().endsWith(".chart") ||
        f.fileName.toLowerCase().endsWith(".mid")
    );
    if (!chartFile) {
      setStatus("No .chart or .mid file found in the chart folder.", true);
      loadBtn.disabled = false;
      return;
    }

    const format = chartFile.fileName.toLowerCase().endsWith(".mid")
      ? "mid"
      : "chart";

    // Build chart modifiers from scanned chart
    const modifiers = {
      song_length: currentScannedChart.song_length || 0,
      hopo_frequency: currentScannedChart.hopo_frequency || 0,
      eighthnote_hopo: currentScannedChart.eighthnote_hopo || false,
      multiplier_note: currentScannedChart.multiplier_note || 0,
      sustain_cutoff_threshold:
        currentScannedChart.sustain_cutoff_threshold ?? -1,
      chord_snap_threshold: currentScannedChart.chord_snap_threshold || 0,
      five_lane_drums: currentScannedChart.five_lane_drums || false,
      pro_drums: currentScannedChart.pro_drums || false,
    };

    // Parse chart
    const parsedChart = parseChartFile(chartFile.data, format, modifiers);

    // Check if the track exists
    const track = parsedChart.trackData.find(
      (t) => t.instrument === instrument && t.difficulty === difficulty
    );
    if (!track) {
      setStatus(
        `No ${difficulty} ${instrument} track found in this chart.`,
        true
      );
      loadBtn.disabled = false;
      return;
    }

    // Find audio files
    const audioExtensions = [".ogg", ".mp3", ".wav", ".opus"];
    const audioFiles: Uint8Array[] = [];
    for (const file of currentChartFiles) {
      const ext = file.fileName
        .toLowerCase()
        .slice(file.fileName.lastIndexOf("."));
      if (audioExtensions.includes(ext)) {
        audioFiles.push(file.data);
      }
    }

    // Load textures
    setStatus("Loading textures...");
    const instrumentType = getInstrumentType(instrument);
    const textures = await ChartPreview.loadTextures(instrumentType);

    // Calculate audio length
    const lastNote = parsedChart.trackData
      .flatMap((t) => t.noteEventGroups.flat())
      .reduce((max, note) => Math.max(max, note.msTime + note.msLength), 0);
    const audioLengthMs = currentScannedChart.song_length || lastNote + 5000;

    // Get start delay from chart metadata
    // delay takes priority over chart_offset if both are present
    // Both use the same sign convention:
    //   - Positive value = audio starts earlier (audio is ahead of chart time)
    //   - Negative value = audio starts later (audio is delayed)
    // We negate to convert to startDelayMs (internal representation):
    //   - startDelayMs < 0 = audio is ahead (at chart time 0, audio is already playing)
    //   - startDelayMs > 0 = audio is delayed (audio starts after chart time 0)
    const startDelayMs = currentScannedChart.delay
      ? -currentScannedChart.delay
      : -(currentScannedChart.chart_offset || 0);

    // Calculate initial seek position from preview_start_time if available
    const initialSeekPercent = currentScannedChart.preview_start_time
      ? currentScannedChart.preview_start_time / audioLengthMs
      : 0;

    // Load the chart into the Web Component player
    setStatus("Creating preview...");
    await player.loadChart({
      parsedChart,
      textures,
      audioFiles,
      instrument,
      difficulty,
      startDelayMs,
      audioLengthMs,
      initialSeekPercent,
    });

    // Save selections
    localStorage.setItem(STORAGE_KEY_LAST_INSTRUMENT, instrument);
    localStorage.setItem(STORAGE_KEY_LAST_DIFFICULTY, difficulty);

    loadBtn.disabled = false;

    const displayName = currentScannedChart.name || currentChartName;
    setStatus(
      `Loaded: ${displayName} - ${instrumentNames[instrument]} (${difficultyNames[difficulty]})`,
      false,
      true
    );
  } catch (error) {
    console.error("Error loading preview:", error);
    setStatus(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      true
    );
    loadBtn.disabled = false;
  }
});

function setStatus(message: string, isError = false, isSuccess = false) {
  statusEl.textContent = message;
  statusEl.className = isError
    ? "status error"
    : isSuccess
    ? "status success"
    : "status";
}
