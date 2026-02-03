import {
  ChartPreview,
  type ChartPreviewConfig,
  type ParsedChart,
} from "./ChartPreview";
import {
  extractSngFile,
  fetchSngFile,
  prepareChartData,
  type LoadFromUrlConfig,
  type LoadFromSngFileConfig,
  type LoadFromChartFilesConfig,
} from "./SngLoader";

export type PlayerState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "ended"
  | "error";

export interface ChartPreviewPlayerConfig {
  parsedChart: ChartPreviewConfig["parsedChart"];
  textures: ChartPreviewConfig["textures"];
  audioFiles: ChartPreviewConfig["audioFiles"];
  instrument: ChartPreviewConfig["instrument"];
  difficulty: ChartPreviewConfig["difficulty"];
  startDelayMs: ChartPreviewConfig["startDelayMs"];
  audioLengthMs: ChartPreviewConfig["audioLengthMs"];
  /** Initial seek position as a percentage (0-1). Defaults to 0. */
  initialSeekPercent?: number;
}

// SVG Icons
const ICONS = {
  play: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg>`,
  pause: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/></svg>`,
  replay: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>`,
  volumeMute: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zm7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/></svg>`,
  volumeLow: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9 4a.5.5 0 0 0-.812-.39L5.825 5.5H3.5A.5.5 0 0 0 3 6v4a.5.5 0 0 0 .5.5h2.325l2.363 1.89A.5.5 0 0 0 9 12V4zm3.025 4a4.486 4.486 0 0 1-1.318 3.182L10 10.475A3.489 3.489 0 0 0 11.025 8 3.49 3.49 0 0 0 10 5.525l.707-.707A4.486 4.486 0 0 1 12.025 8z"/></svg>`,
  volumeHigh: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/><path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/><path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/></svg>`,
  fullscreen: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/></svg>`,
  fullscreenExit: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 0a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/></svg>`,
  spinner: `<svg viewBox="0 0 16 16" fill="currentColor" class="spinner"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/></svg>`,
};

const STYLES = `
:host {
	/* Themeable CSS custom properties */
	--player-bg: #000;
	--controls-bg: #2a2a3a;
	--controls-hover-bg: #3a3a4a;
	--slider-track-bg: #1a1a2a;
	--accent-color: #3b82f6;
	--text-color: #e0e0e0;
	--text-muted: #aaa;
	--error-color: #ef4444;
	--shadow-color: rgba(0, 0, 0, 0.3);

	display: block;
	width: 100%;
	height: 100%;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

* {
	box-sizing: border-box;
}

.player-container {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	background: var(--player-bg);
	position: relative;
}

.player-container.fullscreen {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 9999;
}

.preview-viewport {
	flex: 1;
	width: 100%;
	background: var(--player-bg);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	position: relative;
}

.preview-viewport canvas {
	max-width: 100%;
	max-height: 100%;
}

.fullscreen-btn svg {
	width: 20px;
	height: 20px;
}

.controls {
	display: flex;
	align-items: center;
	background: var(--controls-bg);
	padding: 0;
	height: 40px;
	flex-shrink: 0;
}

.control-btn {
	background: var(--controls-bg);
	border: none;
	color: var(--text-color);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 40px;
	width: 32px;
	padding: 6px;
	transition: background 0.15s;
	flex-shrink: 0;
}

.control-btn:hover:not(:disabled) {
	background: var(--controls-hover-bg);
}

.control-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.control-btn svg {
	width: 20px;
	height: 20px;
}

.control-btn .spinner {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.volume-wrapper {
	position: relative;
	display: flex;
	flex-shrink: 0;
}

.volume-dropdown {
	position: absolute;
	bottom: 100%;
	left: 50%;
	transform: translateX(-50%);
	background: var(--controls-bg);
	border-radius: 4px;
	padding: 10px 6px;
	box-shadow: 0 -2px 10px var(--shadow-color);
	display: none;
	z-index: 20;
}

.volume-wrapper:hover .volume-dropdown,
.volume-dropdown:hover {
	display: block;
}

.volume-slider {
	writing-mode: vertical-lr;
	direction: rtl;
	width: 6px;
	height: 80px;
	-webkit-appearance: none;
	appearance: none;
	background: var(--slider-track-bg);
	border-radius: 3px;
	cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 14px;
	height: 14px;
	background: var(--accent-color);
	border-radius: 50%;
	cursor: pointer;
}

.volume-slider::-moz-range-thumb {
	width: 14px;
	height: 14px;
	background: var(--accent-color);
	border-radius: 50%;
	cursor: pointer;
	border: none;
}

.timestamp {
	color: var(--text-muted);
	font-size: 12px;
	padding: 0 2px;
	white-space: nowrap;
	flex-shrink: 0;
	min-width: 70px;
	text-align: center;
}

.seek-wrapper {
	flex: 1;
	display: flex;
	align-items: center;
	padding: 0 4px;
	min-width: 0;
}

.seek-bar {
	width: 100%;
	height: 6px;
	-webkit-appearance: none;
	appearance: none;
	background: var(--slider-track-bg);
	border-radius: 3px;
	cursor: pointer;
}

.seek-bar::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 14px;
	height: 14px;
	background: var(--accent-color);
	border-radius: 50%;
	cursor: pointer;
	transition: transform 0.1s;
}

.seek-bar::-webkit-slider-thumb:hover {
	transform: scale(1.2);
}

.seek-bar::-moz-range-thumb {
	width: 14px;
	height: 14px;
	background: var(--accent-color);
	border-radius: 50%;
	cursor: pointer;
	border: none;
}

.seek-bar:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.error-message {
	color: var(--error-color);
	font-size: 14px;
	text-align: center;
	padding: 20px;
}
`;

/**
 * A Web Component that provides a complete chart preview player with controls.
 *
 * @example
 * ```html
 * <chart-preview-player id="player"></chart-preview-player>
 *
 * <script type="module">
 *   import { ChartPreviewPlayer, ChartPreview } from 'chart-preview';
 *
 *   const player = document.getElementById('player');
 *   const textures = await ChartPreview.loadTextures(instrumentType);
 *
 *   await player.loadChart({
 *     parsedChart,
 *     textures,
 *     audioFiles,
 *     instrument: 'guitar',
 *     difficulty: 'expert',
 *     startDelayMs: 0,
 *     audioLengthMs: 180000,
 *   });
 * </script>
 * ```
 *
 * @fires player-statechange - When the player state changes
 * @fires player-progress - During playback with current position info
 * @fires player-end - When playback ends
 * @fires player-error - When an error occurs
 *
 * @attr {string} volume - Initial volume (0-100), defaults to 50
 */
export class ChartPreviewPlayer extends HTMLElement {
  private shadow: ShadowRoot;
  private chartPreview: ChartPreview | null = null;
  private _state: PlayerState = "idle";
  private _volume = 50;
  private _lastVolumeBeforeMute = 50;
  private _isFullscreen = false;
  private timestampInterval: ReturnType<typeof setInterval> | null = null;
  private _wasPlayingBeforeSeek = false;
  private _isSeeking = false;
  private _currentAbortController: AbortController | null = null;

  // DOM references
  private container: HTMLDivElement;
  private viewport: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private volumeBtn: HTMLButtonElement;
  private volumeSlider: HTMLInputElement;
  private seekBar: HTMLInputElement;
  private timestampEl: HTMLSpanElement;
  private fullscreenBtn: HTMLButtonElement;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
    this.setupEventListeners();
  }

  static get observedAttributes() {
    return ["volume"];
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === "volume" && newValue !== null) {
      const parsed = parseInt(newValue, 10);
      this._volume = Math.max(0, Math.min(100, isNaN(parsed) ? 50 : parsed));
      if (this.volumeSlider) {
        this.volumeSlider.value = String(this._volume);
      }
      if (this.chartPreview) {
        this.chartPreview.volume = this._volume / 100;
      }
      this.updateVolumeIcon();
    }
  }

  connectedCallback() {
    this.setAttribute("tabindex", "0");
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
  }

  disconnectedCallback() {
    this.dispose();
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenChange
    );
    this.removeEventListener("keydown", this.handleKeydown);
  }

  private render() {
    this.shadow.innerHTML = `
			<style>${STYLES}</style>
			<div class="player-container">
				<div class="preview-viewport">
				</div>
				<div class="controls">
					<button class="control-btn play-btn" aria-label="Play">
						${ICONS.play}
					</button>
					<div class="volume-wrapper">
						<button class="control-btn volume-btn" aria-label="Volume">
							${ICONS.volumeHigh}
						</button>
						<div class="volume-dropdown">
							<input type="range" class="volume-slider" min="0" max="100" value="50" aria-label="Volume">
						</div>
					</div>
					<span class="timestamp">0:00 / 0:00</span>
					<div class="seek-wrapper">
						<input type="range" class="seek-bar" min="0" max="1000" value="0" disabled aria-label="Seek">
					</div>
					<button class="control-btn fullscreen-btn" aria-label="Toggle fullscreen" title="Toggle fullscreen">
						${ICONS.fullscreen}
					</button>
				</div>
			</div>
		`;

    // Cache DOM references
    this.container = this.shadow.querySelector(".player-container")!;
    this.viewport = this.shadow.querySelector(".preview-viewport")!;
    this.playBtn = this.shadow.querySelector(".play-btn")!;
    this.volumeBtn = this.shadow.querySelector(".volume-btn")!;
    this.volumeSlider = this.shadow.querySelector(".volume-slider")!;
    this.seekBar = this.shadow.querySelector(".seek-bar")!;
    this.timestampEl = this.shadow.querySelector(".timestamp")!;
    this.fullscreenBtn = this.shadow.querySelector(
      ".controls .fullscreen-btn"
    )!;

    // Set initial volume from attribute
    const volumeAttr = this.getAttribute("volume");
    if (volumeAttr !== null) {
      const parsed = parseInt(volumeAttr, 10);
      this._volume = Math.max(0, Math.min(100, isNaN(parsed) ? 50 : parsed));
    }
    this.volumeSlider.value = String(this._volume);
    this.updateVolumeIcon();
  }

  private setupEventListeners() {
    // Play button
    this.playBtn.addEventListener("click", () => this.togglePlayPause());

    // Viewport click to play/pause
    this.viewport.addEventListener("click", () => {
      if (
        this._state !== "idle" &&
        this._state !== "loading" &&
        this._state !== "error"
      ) {
        this.togglePlayPause();
      }
    });

    // Volume button (mute toggle)
    this.volumeBtn.addEventListener("click", () => this.toggleMute());

    // Volume slider
    this.volumeSlider.addEventListener("input", () => {
      const newVolume = parseInt(this.volumeSlider.value, 10);
      // Save the volume before it goes to 0 for mute toggle functionality
      if (this._volume > 0 && newVolume === 0) {
        this._lastVolumeBeforeMute = this._volume;
      }
      this._volume = newVolume;
      if (this.chartPreview) {
        this.chartPreview.volume = this._volume / 100;
      }
      this.updateVolumeIcon();
      this.setAttribute("volume", String(this._volume));
    });

    // Seek bar - handle both dragging and clicking
    this.seekBar.addEventListener("mousedown", () => this.onSeekStart());
    this.seekBar.addEventListener("touchstart", () => this.onSeekStart(), {
      passive: true,
    });
    this.seekBar.addEventListener("input", () => this.onSeekInput());
    this.seekBar.addEventListener("mouseup", () => this.onSeekEnd());
    this.seekBar.addEventListener("touchend", () => this.onSeekEnd());
    // Handle case where user drags outside the element
    this.seekBar.addEventListener("mouseleave", (e) => {
      if (e.buttons === 0 && this._isSeeking) {
        this.onSeekEnd();
      }
    });

    // Fullscreen button
    this.fullscreenBtn.addEventListener("click", () => {
      this.toggleFullscreen();
    });

    // Keyboard controls
    this.addEventListener("keydown", this.handleKeydown);
  }

  private handleKeydown = (e: KeyboardEvent) => {
    // Don't handle if user is interacting with inputs
    if (e.target instanceof HTMLInputElement) return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        if (
          this._state !== "idle" &&
          this._state !== "loading" &&
          this._state !== "error"
        ) {
          this.togglePlayPause();
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.seekRelative(-5000);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.seekRelative(5000);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.setVolume(Math.min(100, this._volume + 10));
        break;
      case "ArrowDown":
        e.preventDefault();
        this.setVolume(Math.max(0, this._volume - 10));
        break;
      case "KeyM":
        e.preventDefault();
        this.toggleMute();
        break;
      case "KeyF":
        e.preventDefault();
        this.toggleFullscreen();
        break;
      case "Escape":
        if (this._isFullscreen) {
          e.preventDefault();
          this.toggleFullscreen();
        }
        break;
    }
  };

  private handleFullscreenChange = () => {
    this._isFullscreen = document.fullscreenElement === this.container;
    this.container.classList.toggle("fullscreen", this._isFullscreen);
    this.fullscreenBtn.innerHTML = this._isFullscreen
      ? ICONS.fullscreenExit
      : ICONS.fullscreen;
    this.fullscreenBtn.title = this._isFullscreen
      ? "Exit fullscreen"
      : "Toggle fullscreen";
  };

  private onSeekStart() {
    if (!this._isSeeking) {
      this._isSeeking = true;
      this._wasPlayingBeforeSeek = this._state === "playing";
      // Pause if playing to allow smooth seeking
      if (this._wasPlayingBeforeSeek && this.chartPreview) {
        this.chartPreview.togglePaused();
        this.setState("seeking");
      }
    }
  }

  private async onSeekInput() {
    if (!this.chartPreview) return;
    this.setState("seeking");
    await this.chartPreview.seek(parseInt(this.seekBar.value, 10) / 1000);
    this.updateTimestamp();
  }

  private async onSeekEnd() {
    if (!this._isSeeking) return;
    this._isSeeking = false;

    if (!this.chartPreview) {
      this.setState("paused");
      return;
    }

    // Resume playback if user was playing before seeking
    if (this._wasPlayingBeforeSeek) {
      this._wasPlayingBeforeSeek = false;
      await this.chartPreview.togglePaused();
      this.setState("playing");
      this.startTimestampUpdates();
    } else {
      this.setState("paused");
    }
  }

  /**
   * Prepares the viewport for loading by removing messages and setting loading state.
   */
  private prepareForLoading(): void {
    this.setState("loading");

    // Remove error message if present
    const errorMessage = this.viewport.querySelector(".error-message");
    if (errorMessage) errorMessage.remove();
  }

  /**
   * Handles load errors by showing error message and dispatching error event.
   */
  private handleLoadError(error: unknown, context: string): void {
    // Don't show error for aborted requests
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    console.error(`Failed to load chart ${context}:`, error);
    this.setState("error");

    // Show error message
    const errorEl = document.createElement("div");
    errorEl.className = "error-message";
    errorEl.textContent = `Failed to load: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    this.viewport.appendChild(errorEl);

    this.dispatchEvent(
      new CustomEvent("player-error", {
        detail: { error },
        bubbles: true,
        composed: true,
      })
    );
  }

  private setState(state: PlayerState) {
    const oldState = this._state;
    this._state = state;
    this.updatePlayButton();

    if (oldState !== state) {
      this.dispatchEvent(
        new CustomEvent("player-statechange", {
          detail: { state, previousState: oldState },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private updatePlayButton() {
    switch (this._state) {
      case "idle":
        this.playBtn.disabled = false;
        this.playBtn.innerHTML = ICONS.play;
        this.playBtn.setAttribute("aria-label", "Play");
        break;
      case "loading":
        this.playBtn.disabled = true;
        this.playBtn.innerHTML = ICONS.spinner;
        this.playBtn.setAttribute("aria-label", "Loading");
        break;
      case "ready":
      case "paused":
      case "seeking":
        this.playBtn.disabled = false;
        this.playBtn.innerHTML = ICONS.play;
        this.playBtn.setAttribute("aria-label", "Play");
        break;
      case "playing":
        this.playBtn.disabled = false;
        this.playBtn.innerHTML = ICONS.pause;
        this.playBtn.setAttribute("aria-label", "Pause");
        break;
      case "ended":
        this.playBtn.disabled = false;
        this.playBtn.innerHTML = ICONS.replay;
        this.playBtn.setAttribute("aria-label", "Replay");
        break;
      case "error":
        this.playBtn.disabled = true;
        this.playBtn.innerHTML = ICONS.play;
        this.playBtn.setAttribute("aria-label", "Error");
        break;
    }
  }

  private updateVolumeIcon() {
    if (this._volume === 0) {
      this.volumeBtn.innerHTML = ICONS.volumeMute;
    } else if (this._volume <= 50) {
      this.volumeBtn.innerHTML = ICONS.volumeLow;
    } else {
      this.volumeBtn.innerHTML = ICONS.volumeHigh;
    }
  }

  private updateTimestamp() {
    if (!this.chartPreview) {
      this.timestampEl.textContent = "0:00 / 0:00";
      return;
    }
    const current = this.formatTime(this.chartPreview.chartCurrentTimeMs);
    const total = this.formatTime(this.chartPreview.chartEndTimeMs);
    this.timestampEl.textContent = `${current} / ${total}`;
  }

  private formatTime(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private startTimestampUpdates() {
    this.stopTimestampUpdates();
    this.timestampInterval = setInterval(() => this.updateTimestamp(), 100);
  }

  private stopTimestampUpdates() {
    if (this.timestampInterval) {
      clearInterval(this.timestampInterval);
      this.timestampInterval = null;
    }
  }

  // Public API

  /**
   * Current player state
   */
  get state(): PlayerState {
    return this._state;
  }

  /**
   * Whether the player is currently playing
   */
  get isPlaying(): boolean {
    return this._state === "playing";
  }

  /**
   * Current volume (0-100)
   */
  get volume(): number {
    return this._volume;
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(100, volume));
    this.volumeSlider.value = String(this._volume);
    if (this.chartPreview) {
      this.chartPreview.volume = this._volume / 100;
    }
    this.updateVolumeIcon();
    this.setAttribute("volume", String(this._volume));
  }

  /**
   * Current playback position in milliseconds
   */
  get currentTimeMs(): number {
    return this.chartPreview?.chartCurrentTimeMs ?? 0;
  }

  /**
   * Total duration in milliseconds
   */
  get durationMs(): number {
    return this.chartPreview?.chartEndTimeMs ?? 0;
  }

  /**
   * Whether the player is in fullscreen mode
   */
  get isFullscreen(): boolean {
    return this._isFullscreen;
  }

  /**
   * Load a chart into the player from pre-processed data.
   * Use this when you've already parsed the chart and loaded textures.
   *
   * @example
   * ```ts
   * const textures = await ChartPreview.loadTextures(instrumentType);
   * await player.loadChart({
   *   parsedChart,
   *   textures,
   *   audioFiles,
   *   instrument: 'guitar',
   *   difficulty: 'expert',
   *   startDelayMs: 0,
   *   audioLengthMs: 180000,
   * });
   * ```
   */
  async loadChart(config: ChartPreviewPlayerConfig): Promise<void> {
    try {
      // Clean up previous instance
      if (this.chartPreview) {
        this.chartPreview.dispose();
        this.chartPreview = null;
      }
      this.stopTimestampUpdates();

      this.prepareForLoading();

      // Create a container div for the ChartPreview
      let previewContainer = this.viewport.querySelector(
        ".preview-render"
      ) as HTMLDivElement;
      if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.className = "preview-render";
        previewContainer.style.cssText = "width: 100%; height: 100%;";
        this.viewport.appendChild(previewContainer);
      }

      // Create the chart preview
      this.chartPreview = await ChartPreview.create({
        parsedChart: config.parsedChart,
        textures: config.textures,
        audioFiles: config.audioFiles,
        instrument: config.instrument,
        difficulty: config.difficulty,
        startDelayMs: config.startDelayMs,
        audioLengthMs: config.audioLengthMs,
        container: previewContainer,
      });

      // Set volume
      this.chartPreview.volume = this._volume / 100;

      // Setup event listeners
      this.chartPreview.on("progress", (percent) => {
        this.seekBar.value = String(Math.round(percent * 1000));
        this.dispatchEvent(
          new CustomEvent("player-progress", {
            detail: {
              percent,
              currentMs: this.chartPreview!.chartCurrentTimeMs,
              totalMs: this.chartPreview!.chartEndTimeMs,
            },
            bubbles: true,
            composed: true,
          })
        );
      });

      this.chartPreview.on("end", async () => {
        await this.chartPreview!.togglePaused();
        this.setState("ended");
        this.stopTimestampUpdates();
        this.dispatchEvent(
          new CustomEvent("player-end", {
            bubbles: true,
            composed: true,
          })
        );
      });

      // Seek to initial position if provided
      if (
        config.initialSeekPercent !== undefined &&
        config.initialSeekPercent > 0
      ) {
        await this.chartPreview.seek(config.initialSeekPercent);
        this.seekBar.value = String(
          Math.round(config.initialSeekPercent * 1000)
        );
      }

      // Enable controls
      this.seekBar.disabled = false;
      this.startTimestampUpdates();

      this.setState("ready");
    } catch (error) {
      this.handleLoadError(error, "");
    }
  }

  /**
   * Load a chart from a URL pointing to a .sng file.
   * This is the simplest way to load a chart - just provide a URL and instrument/difficulty.
   *
   * @example
   * ```ts
   * await player.loadFromUrl({
   *   url: 'https://files.enchor.us/abc123.sng',
   *   instrument: 'guitar',
   *   difficulty: 'expert',
   * });
   * ```
   */
  async loadFromUrl(config: LoadFromUrlConfig): Promise<void> {
    try {
      // Cancel any previous pending fetch
      if (this._currentAbortController) {
        this._currentAbortController.abort();
      }
      this._currentAbortController = new AbortController();
      const signal = config.signal ?? this._currentAbortController.signal;

      this.prepareForLoading();

      // Fetch the .sng file
      const sngData = await fetchSngFile(config.url, signal);

      // Extract and prepare the chart
      const files = await extractSngFile(sngData);
      const preparedData = await prepareChartData(
        files,
        config.instrument,
        config.difficulty,
        config.initialSeekPercent
      );

      // Load the chart
      await this.loadChart({
        parsedChart: preparedData.parsedChart,
        textures: preparedData.textures,
        audioFiles: preparedData.audioFiles,
        instrument: preparedData.instrument,
        difficulty: preparedData.difficulty,
        startDelayMs: preparedData.startDelayMs,
        audioLengthMs: preparedData.audioLengthMs,
        initialSeekPercent: preparedData.initialSeekPercent,
      });

      this._currentAbortController = null;
    } catch (error) {
      this._currentAbortController = null;
      this.handleLoadError(error, "from URL");
    }
  }

  /**
   * Load a chart from raw .sng file data.
   * Use this when you've already fetched the .sng file yourself.
   *
   * @example
   * ```ts
   * const response = await fetch('https://files.enchor.us/abc123.sng');
   * const sngData = new Uint8Array(await response.arrayBuffer());
   *
   * await player.loadFromSngFile({
   *   sngFile: sngData,
   *   instrument: 'guitar',
   *   difficulty: 'expert',
   * });
   * ```
   */
  async loadFromSngFile(config: LoadFromSngFileConfig): Promise<void> {
    try {
      this.prepareForLoading();

      // Extract and prepare the chart
      const files = await extractSngFile(config.sngFile);
      const preparedData = await prepareChartData(
        files,
        config.instrument,
        config.difficulty,
        config.initialSeekPercent
      );

      // Load the chart
      await this.loadChart({
        parsedChart: preparedData.parsedChart,
        textures: preparedData.textures,
        audioFiles: preparedData.audioFiles,
        instrument: preparedData.instrument,
        difficulty: preparedData.difficulty,
        startDelayMs: preparedData.startDelayMs,
        audioLengthMs: preparedData.audioLengthMs,
        initialSeekPercent: preparedData.initialSeekPercent,
      });
    } catch (error) {
      this.handleLoadError(error, "from .sng file");
    }
  }

  /**
   * Load a chart from individual files (chart file + audio files).
   * Use this when loading from a folder or when you have the files separately.
   *
   * @example
   * ```ts
   * // From file picker
   * const files = await getFilesFromFolder();
   *
   * await player.loadFromChartFiles({
   *   files: files.map(f => ({ fileName: f.name, data: new Uint8Array(f.data) })),
   *   instrument: 'guitar',
   *   difficulty: 'expert',
   * });
   * ```
   */
  async loadFromChartFiles(config: LoadFromChartFilesConfig): Promise<void> {
    try {
      this.prepareForLoading();

      // Prepare the chart data
      const preparedData = await prepareChartData(
        config.files,
        config.instrument,
        config.difficulty,
        config.initialSeekPercent
      );

      // Load the chart
      await this.loadChart({
        parsedChart: preparedData.parsedChart,
        textures: preparedData.textures,
        audioFiles: preparedData.audioFiles,
        instrument: preparedData.instrument,
        difficulty: preparedData.difficulty,
        startDelayMs: preparedData.startDelayMs,
        audioLengthMs: preparedData.audioLengthMs,
        initialSeekPercent: preparedData.initialSeekPercent,
      });
    } catch (error) {
      this.handleLoadError(error, "from files");
    }
  }

  /**
   * Toggle between playing and paused states
   */
  async togglePlayPause(): Promise<void> {
    if (!this.chartPreview) return;

    if (this._state === "ended") {
      // Restart from beginning
      await this.chartPreview.seek(0);
      this.seekBar.value = "0";
      this.setState("paused");
    }

    if (this._state === "paused" || this._state === "ready") {
      this.setState("loading");
      await this.chartPreview.togglePaused();
      this.setState("playing");
      this.startTimestampUpdates();
    } else if (this._state === "playing") {
      this.setState("loading");
      await this.chartPreview.togglePaused();
      this.setState("paused");
    }
  }

  /**
   * Play the chart
   */
  async play(): Promise<void> {
    if (
      this._state === "paused" ||
      this._state === "ready" ||
      this._state === "ended"
    ) {
      await this.togglePlayPause();
    }
  }

  /**
   * Pause the chart
   */
  async pause(): Promise<void> {
    if (this._state === "playing") {
      await this.togglePlayPause();
    }
  }

  /**
   * Seek to a specific position
   * @param percent Position as a percentage (0-1)
   */
  async seek(percent: number): Promise<void> {
    if (!this.chartPreview) return;
    const wasPlaying = this._state === "playing";
    if (wasPlaying) {
      await this.chartPreview.togglePaused();
    }
    await this.chartPreview.seek(Math.max(0, Math.min(1, percent)));
    this.seekBar.value = String(Math.round(percent * 1000));
    this.updateTimestamp();
    this.setState("paused");
  }

  /**
   * Seek relative to current position
   * @param deltaMs Milliseconds to seek (positive = forward, negative = backward)
   */
  async seekRelative(deltaMs: number): Promise<void> {
    if (!this.chartPreview) return;
    const currentMs = this.chartPreview.chartCurrentTimeMs;
    const totalMs = this.chartPreview.chartEndTimeMs;
    const newPercent = Math.max(
      0,
      Math.min(1, (currentMs + deltaMs) / totalMs)
    );
    await this.seek(newPercent);
  }

  /**
   * Toggle mute
   */
  toggleMute(): void {
    if (this._volume > 0) {
      this._lastVolumeBeforeMute = this._volume;
      this.setVolume(0);
    } else {
      this.setVolume(this._lastVolumeBeforeMute || 50);
    }
  }

  /**
   * Toggle fullscreen mode
   */
  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenEnabled) return;

    if (this._isFullscreen) {
      await document.exitFullscreen();
    } else {
      await this.container.requestFullscreen();
    }
  }

  /**
   * Dispose of the player and clean up resources
   */
  dispose(): void {
    // Cancel any pending network requests
    if (this._currentAbortController) {
      this._currentAbortController.abort();
      this._currentAbortController = null;
    }
    this.stopTimestampUpdates();
    if (this.chartPreview) {
      this.chartPreview.dispose();
      this.chartPreview = null;
    }
    this._isSeeking = false;
    this._wasPlayingBeforeSeek = false;
    this.setState("idle");
    this.seekBar.disabled = true;
    this.seekBar.value = "0";
  }
}

// Register the custom element
if (
  typeof window !== "undefined" &&
  !customElements.get("chart-preview-player")
) {
  customElements.define("chart-preview-player", ChartPreviewPlayer);
}

// TypeScript declaration merging for global HTMLElementTagNameMap
declare global {
  interface HTMLElementTagNameMap {
    "chart-preview-player": ChartPreviewPlayer;
  }
}
