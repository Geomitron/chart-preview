# chart-preview

A 3D chart preview player for rhythm games like Clone Hero. Renders chart files as an interactive video-like preview using THREE.js.

## Features

- Renders `.chart` and `.mid` files as a 3D highway visualization
- Supports 5-fret guitar, 6-fret (GHL) guitar, and drums
- Plays audio files in sync with the visual preview
- Video player-like controls (play, pause, seek, volume, fullscreen)
- Keyboard shortcuts for easy control
- Framework-agnostic - works with React, Angular, Vue, or vanilla JS
- **Web Component** that can be dropped into any project
- **Multiple instance support** - run several players simultaneously
- **Simple URL-based loading** - just provide a URL to a .sng file
- **Animated note textures** - supports animated WebP textures

## Installation

```bash
npm install chart-preview
```

## Quick Start

The simplest way to use chart-preview is with the Web Component and URL-based loading:

```html
<chart-preview-player id="player"></chart-preview-player>

<script type="module">
  const player = document.getElementById("player");

  await player.loadFromUrl({
    url: "https://files.enchor.us/abc123.sng",
    instrument: "guitar",
    difficulty: "expert",
  });
</script>
```

That's it! The component handles fetching, parsing, texture loading, and rendering.

## Usage Options

### Option 1: URL-Based Loading (Simplest)

Load directly from a URL to a `.sng` file:

```typescript
import "chart-preview"; // Registers the web component

const player = document.querySelector("chart-preview-player");

await player.loadFromUrl({
  url: "https://files.enchor.us/abc123.sng",
  instrument: "guitar",
  difficulty: "expert",
  initialSeekPercent: 0.25, // Optional: start at 25%
});
```

### Option 2: Raw .sng File Loading

When you've already fetched the `.sng` file:

```typescript
const response = await fetch("https://files.enchor.us/abc123.sng");
const sngData = new Uint8Array(await response.arrayBuffer());

await player.loadFromSngFile({
  sngFile: sngData,
  instrument: "guitar",
  difficulty: "expert",
});
```

### Option 3: Individual Files Loading

When loading from a folder or file picker:

```typescript
// From a file input or folder selection
const files = [
  { fileName: "notes.chart", data: chartFileData },
  { fileName: "song.ogg", data: audioFileData },
  { fileName: "guitar.ogg", data: guitarAudioData },
];

await player.loadFromChartFiles({
  files,
  instrument: "guitar",
  difficulty: "expert",
});
```

### Option 4: Pre-Processed Data (Advanced)

For maximum control, you can pre-process the data yourself:

```typescript
import {
  ChartPreview,
  ChartPreviewPlayer,
  getInstrumentType,
  areAnimationsSupported,
} from "chart-preview";
import { parseChartFile } from "scan-chart";

// 1. Parse your chart file
const parsedChart = parseChartFile(chartData, "chart", modifiers);

// 2. Load textures (cache and reuse for same instrument type)
const textures = await ChartPreview.loadTextures(getInstrumentType("guitar"), {
  animationsEnabled: areAnimationsSupported(),
});

// 3. Load the chart
await player.loadChart({
  parsedChart,
  textures,
  audioFiles: [audioData],
  instrument: "guitar",
  difficulty: "expert",
  startDelayMs: 0,
  audioLengthMs: 180000,
});
```

## Framework Integration

### Angular

```typescript
import {
  Component,
  ViewChild,
  ElementRef,
  CUSTOM_ELEMENTS_SCHEMA,
} from "@angular/core";
import type { ChartPreviewPlayer } from "chart-preview";
import "chart-preview"; // Register web component

@Component({
  selector: "app-chart-preview",
  template: `
    <chart-preview-player
      #player
      [attr.volume]="volume"
      (player-statechange)="onStateChange($event)"
      (player-error)="onError($event)"
    >
    </chart-preview-player>
  `,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChartPreviewComponent {
  @ViewChild("player") player: ElementRef<ChartPreviewPlayer>;
  volume = 50;

  async loadChart(chartUrl: string, instrument: string, difficulty: string) {
    await this.player.nativeElement.loadFromUrl({
      url: chartUrl,
      instrument,
      difficulty,
    });
  }

  onStateChange(event: CustomEvent) {
    console.log("State:", event.detail.state);
  }

  onError(event: CustomEvent) {
    console.error("Error:", event.detail.error);
  }
}
```

### React

```tsx
import { useRef, useEffect } from "react";
import type { ChartPreviewPlayer } from "chart-preview";
import "chart-preview";

function ChartPreview({ chartUrl, instrument, difficulty }) {
  const playerRef = useRef<ChartPreviewPlayer>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !chartUrl) return;

    player.loadFromUrl({ url: chartUrl, instrument, difficulty });

    const handleError = (e: CustomEvent) => console.error(e.detail.error);
    player.addEventListener("player-error", handleError);

    return () => {
      player.removeEventListener("player-error", handleError);
      player.dispose();
    };
  }, [chartUrl, instrument, difficulty]);

  return <chart-preview-player ref={playerRef} volume="50" />;
}
```

### Vue

```vue
<template>
  <chart-preview-player
    ref="player"
    :volume="volume"
    @player-statechange="onStateChange"
    @player-error="onError"
  />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import "chart-preview";

const player = ref(null);
const volume = ref(50);

async function loadChart(url, instrument, difficulty) {
  await player.value.loadFromUrl({ url, instrument, difficulty });
}

function onStateChange(event) {
  console.log("State:", event.detail.state);
}

function onError(event) {
  console.error("Error:", event.detail.error);
}

onUnmounted(() => {
  player.value?.dispose();
});
</script>
```

## Web Component API

### `<chart-preview-player>`

A complete chart preview player with built-in controls.

#### Attributes

| Attribute | Type     | Default | Description            |
| --------- | -------- | ------- | ---------------------- |
| `volume`  | `string` | `"50"`  | Initial volume (0-100) |

#### Properties

| Property        | Type          | Description                     |
| --------------- | ------------- | ------------------------------- |
| `state`         | `PlayerState` | Current player state            |
| `isPlaying`     | `boolean`     | Whether currently playing       |
| `volume`        | `number`      | Current volume (0-100)          |
| `currentTimeMs` | `number`      | Current playback position in ms |
| `durationMs`    | `number`      | Total duration in ms            |
| `isFullscreen`  | `boolean`     | Whether in fullscreen mode      |

#### Methods

| Method                       | Description                       |
| ---------------------------- | --------------------------------- |
| `loadFromUrl(config)`        | Load from a URL to a .sng file    |
| `loadFromSngFile(config)`    | Load from raw .sng file data      |
| `loadFromChartFiles(config)` | Load from individual files        |
| `loadChart(config)`          | Load from pre-processed data      |
| `togglePlayPause()`          | Toggle play/pause                 |
| `play()`                     | Start playback                    |
| `pause()`                    | Pause playback                    |
| `seek(percent)`              | Seek to position (0-1)            |
| `seekRelative(deltaMs)`      | Seek relative to current position |
| `setVolume(volume)`          | Set volume (0-100)                |
| `toggleMute()`               | Toggle mute                       |
| `toggleFullscreen()`         | Toggle fullscreen mode            |
| `dispose()`                  | Clean up resources                |

#### Events

| Event                | Detail                            | Description       |
| -------------------- | --------------------------------- | ----------------- |
| `player-statechange` | `{ state, previousState }`        | State changed     |
| `player-progress`    | `{ percent, currentMs, totalMs }` | Playback progress |
| `player-end`         | -                                 | Playback ended    |
| `player-error`       | `{ error }`                       | Error occurred    |

#### Player States

```typescript
type PlayerState =
  | "idle" // No chart loaded
  | "loading" // Loading chart/audio
  | "ready" // Ready to play
  | "playing" // Currently playing
  | "paused" // Paused
  | "seeking" // Seeking
  | "ended" // Playback ended
  | "error"; // Error occurred
```

#### Keyboard Shortcuts

| Key      | Action            |
| -------- | ----------------- |
| `Space`  | Play/Pause        |
| `←`      | Seek backward 5s  |
| `→`      | Seek forward 5s   |
| `↑`      | Volume up 10%     |
| `↓`      | Volume down 10%   |
| `M`      | Toggle mute       |
| `F`      | Toggle fullscreen |
| `Escape` | Exit fullscreen   |

## Multiple Instances

The library supports multiple simultaneous players on the same page:

```html
<chart-preview-player id="player1"></chart-preview-player>
<chart-preview-player id="player2"></chart-preview-player>
<chart-preview-player id="player3"></chart-preview-player>

<script type="module">
  const players = document.querySelectorAll("chart-preview-player");

  // Each player can load a different chart
  await players[0].loadFromUrl({
    url: "chart1.sng",
    instrument: "guitar",
    difficulty: "expert",
  });
  await players[1].loadFromUrl({
    url: "chart2.sng",
    instrument: "drums",
    difficulty: "hard",
  });
  await players[2].loadFromUrl({
    url: "chart3.sng",
    instrument: "bass",
    difficulty: "medium",
  });

  // All can play simultaneously
  players.forEach((p) => p.play());
</script>
```

The library uses a shared `AudioContext` internally to support many players without hitting browser limits.

## Configuration Types

### LoadFromUrlConfig

```typescript
interface LoadFromUrlConfig {
  /** URL to the .sng file */
  url: string;
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position (0-1). Defaults to 0 */
  initialSeekPercent?: number;
  /** AbortSignal to cancel the fetch operation */
  signal?: AbortSignal;
  /** Whether to enable animated textures. Defaults to true */
  animationsEnabled?: boolean;
}
```

### LoadFromSngFileConfig

```typescript
interface LoadFromSngFileConfig {
  /** Raw .sng file data */
  sngFile: Uint8Array;
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position (0-1). Defaults to 0 */
  initialSeekPercent?: number;
  /** Whether to enable animated textures. Defaults to true */
  animationsEnabled?: boolean;
}
```

### LoadFromChartFilesConfig

```typescript
interface LoadFromChartFilesConfig {
  /** Array of files with their names and data */
  files: { fileName: string; data: Uint8Array }[];
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** Initial seek position (0-1). Defaults to 0 */
  initialSeekPercent?: number;
  /** Whether to enable animated textures. Defaults to true */
  animationsEnabled?: boolean;
}
```

### ChartPreviewPlayerConfig (Advanced)

```typescript
interface ChartPreviewPlayerConfig {
  parsedChart: ParsedChart;
  textures: Awaited<ReturnType<typeof ChartPreview.loadTextures>>;
  audioFiles: Uint8Array[];
  instrument: Instrument;
  difficulty: Difficulty;
  startDelayMs: number;
  audioLengthMs: number;
  initialSeekPercent?: number;
}
```

## Supported Instruments & Difficulties

### Instruments

| Value             | Description          |
| ----------------- | -------------------- |
| `'guitar'`        | Lead Guitar (5-fret) |
| `'guitarcoop'`    | Co-op Guitar         |
| `'rhythm'`        | Rhythm Guitar        |
| `'bass'`          | Bass Guitar          |
| `'drums'`         | Drums                |
| `'keys'`          | Keys                 |
| `'guitarghl'`     | GHL Guitar (6-fret)  |
| `'guitarcoopghl'` | GHL Co-op Guitar     |
| `'rhythmghl'`     | GHL Rhythm Guitar    |
| `'bassghl'`       | GHL Bass             |

### Difficulties

| Value      | Description |
| ---------- | ----------- |
| `'expert'` | Expert      |
| `'hard'`   | Hard        |
| `'medium'` | Medium      |
| `'easy'`   | Easy        |

## Low-Level API

For advanced use cases, you can use the `ChartPreview` class directly:

```typescript
import {
  ChartPreview,
  getInstrumentType,
  areAnimationsSupported,
} from "chart-preview";

// Load textures (cache for reuse)
// Optionally disable animations for better performance
const textures = await ChartPreview.loadTextures(getInstrumentType("guitar"), {
  animationsEnabled: areAnimationsSupported(), // or set to false to always use static textures
});

// Create preview
const preview = await ChartPreview.create({
  parsedChart,
  textures,
  audioFiles,
  instrument: "guitar",
  difficulty: "expert",
  startDelayMs: 0,
  audioLengthMs: 180000,
  container: document.getElementById("container"),
});

// Control playback
await preview.togglePaused();
await preview.seek(0.5);
preview.volume = 0.8;

// Listen to events
preview.on("progress", (percent) => console.log(`${percent * 100}%`));
preview.on("end", () => console.log("Ended"));

// Clean up
preview.dispose();
```

## Helper Utilities

The library exports helper utilities for advanced use cases:

```typescript
import {
  extractSngFile,
  fetchSngFile,
  prepareChartData,
  findChartFile,
  findAudioFiles,
  isVideoFile,
  areAnimationsSupported,
} from "chart-preview";

// Check if animated textures are supported (ImageDecoder API)
if (areAnimationsSupported()) {
  console.log("Animated note textures will be used");
}

// Fetch and extract a .sng file
const sngData = await fetchSngFile("https://example.com/chart.sng");
const files = await extractSngFile(sngData);

// Find specific files
const chartFile = findChartFile(files); // Returns .chart or .mid file
const audioFiles = findAudioFiles(files); // Returns audio file data

// Check if a file is a video (to exclude from processing)
const nonVideoFiles = files.filter((f) => !isVideoFile(f.fileName));

// Prepare all data for playback
const preparedData = await prepareChartData(files, "guitar", "expert");
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npm run lint
```

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Requires support for:

- Web Components (Custom Elements v1)
- Web Audio API
- WebGL

**Animated Textures:** Requires the ImageDecoder API (Chromium-based browsers only: Chrome, Edge, Opera). Use `areAnimationsSupported()` to check. Other browsers fall back to static textures.

## Dependencies

- `three` - 3D rendering
- `scan-chart` - Chart parsing
- `parse-sng` - .sng file extraction
- `eventemitter3` - Event handling

## License

MIT
