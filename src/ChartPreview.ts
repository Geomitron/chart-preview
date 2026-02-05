import { EventEmitter } from "eventemitter3";
import {
  Difficulty,
  getInstrumentType,
  Instrument,
  InstrumentType,
  instrumentTypes,
  NoteEvent,
  noteFlags,
  NoteType,
  noteTypes,
  parseChartFile,
} from "scan-chart";
import * as THREE from "three";
import {
  getSharedAudioContext,
  registerInstance,
  unregisterInstance,
  isAudioContextSupported,
} from "./SharedAudioContext";

export type ParsedChart = ReturnType<typeof parseChartFile>;

const HIGHWAY_DURATION_MS = 1500;
const SCALE = 0.105;
const NOTE_SPAN_WIDTH = 0.95;

/**
 * Check if the ImageDecoder API is available for animated WebP support.
 * This API is available in Chromium-based browsers (Chrome, Edge, Opera).
 */
function isImageDecoderSupported(): boolean {
  return typeof ImageDecoder !== "undefined";
}

/**
 * Check if animations are supported on this browser.
 * Use this to conditionally enable/disable animation features.
 */
export function areAnimationsSupported(): boolean {
  return isImageDecoderSupported();
}

/**
 * Manages an animated WebP texture using the ImageDecoder API.
 * Pre-decodes all frames during initialization for optimal performance.
 * Falls back to a static texture if ImageDecoder is not supported.
 */
class AnimatedTexture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  private frameIndex = 0;
  private frameCount = 0;
  private lastFrameTime = 0;
  private frameDurations: number[] = [];
  /** Pre-decoded frames stored as ImageBitmap for fast synchronous access */
  private frameCache: ImageBitmap[] = [];
  private isAnimated = false;
  private disposed = false;

  private constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /**
   * Creates an AnimatedTexture from a URL.
   * Uses ImageDecoder for animation if available, otherwise loads as static texture.
   * Pre-decodes all frames during initialization for optimal render performance.
   */
  static async create(url: string): Promise<AnimatedTexture | THREE.Texture> {
    if (!isImageDecoderSupported()) {
      // Fall back to static texture loading
      return loadStaticTexture(url);
    }

    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch ${url}`);
      }

      // Check if the image type is supported for decoding
      const contentType = response.headers.get("content-type") || "image/webp";
      const isSupported = await ImageDecoder.isTypeSupported(contentType);
      if (!isSupported) {
        // Fall back to static texture
        return loadStaticTexture(url);
      }

      const decoder = new ImageDecoder({
        data: response.body,
        type: contentType,
      });

      await decoder.completed;

      const track = decoder.tracks.selectedTrack;
      if (!track) {
        throw new Error("No track found in image");
      }

      const frameCount = track.frameCount;

      // If only one frame, just return a static texture
      if (frameCount <= 1) {
        const result = await decoder.decode({ frameIndex: 0 });
        const frame = result.image;
        const animTexture = new AnimatedTexture(
          frame.displayWidth,
          frame.displayHeight
        );
        animTexture.ctx.drawImage(frame, 0, 0);
        animTexture.texture.needsUpdate = true;
        frame.close();
        decoder.close();
        return animTexture.texture;
      }

      // Animated image - pre-decode ALL frames for optimal performance
      const firstResult = await decoder.decode({ frameIndex: 0 });
      const firstFrame = firstResult.image;
      const animTexture = new AnimatedTexture(
        firstFrame.displayWidth,
        firstFrame.displayHeight
      );

      // Pre-decode all frames into ImageBitmap cache
      animTexture.frameDurations = [];
      animTexture.frameCache = [];

      for (let i = 0; i < frameCount; i++) {
        try {
          const frameResult = await decoder.decode({ frameIndex: i });
          const videoFrame = frameResult.image;

          // Create an ImageBitmap from the VideoFrame for fast synchronous access
          const bitmap = await createImageBitmap(videoFrame);
          animTexture.frameCache.push(bitmap);

          // Duration is in microseconds, convert to milliseconds
          const durationMs = (videoFrame.duration ?? 100000) / 1000;
          animTexture.frameDurations.push(durationMs);
          videoFrame.close();
        } catch {
          animTexture.frameDurations.push(100); // Default 100ms
          // If frame decode fails, reuse the last successful frame or create empty bitmap
          if (animTexture.frameCache.length > 0) {
            animTexture.frameCache.push(
              animTexture.frameCache[animTexture.frameCache.length - 1]
            );
          }
        }
      }

      // Draw the first frame
      if (animTexture.frameCache.length > 0) {
        animTexture.ctx.drawImage(animTexture.frameCache[0], 0, 0);
        animTexture.texture.needsUpdate = true;
      }

      animTexture.frameCount = animTexture.frameCache.length;
      animTexture.isAnimated = animTexture.frameCount > 1;
      animTexture.lastFrameTime = performance.now();

      // Close the decoder - we no longer need it since all frames are cached
      firstFrame.close();
      decoder.close();

      return animTexture;
    } catch (error) {
      // Fall back to static texture on any error
      console.warn(
        "Failed to load animated texture, falling back to static:",
        error
      );
      return loadStaticTexture(url);
    }
  }

  /**
   * Updates the texture to the current animation frame based on elapsed time.
   * This method is SYNCHRONOUS for optimal render performance - all frames
   * are pre-decoded during initialization.
   */
  tick(): void {
    if (!this.isAnimated || this.disposed || this.frameCache.length === 0) {
      return;
    }

    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    const currentFrameDuration = this.frameDurations[this.frameIndex] || 100;

    if (elapsed >= currentFrameDuration) {
      this.frameIndex = (this.frameIndex + 1) % this.frameCount;
      this.lastFrameTime = now;

      // Synchronous frame update from pre-decoded cache
      const frame = this.frameCache[this.frameIndex];
      if (frame) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(frame, 0, 0);
        this.texture.needsUpdate = true;
      }
    }
  }

  /**
   * Disposes of resources used by this animated texture.
   */
  dispose(): void {
    this.disposed = true;
    // Close all cached ImageBitmaps
    for (const bitmap of this.frameCache) {
      bitmap.close();
    }
    this.frameCache = [];
    this.texture.dispose();
  }
}

/**
 * Loads a static texture from a URL with proper error handling.
 * Creates a fallback placeholder texture if loading fails.
 */
async function loadStaticTexture(url: string): Promise<THREE.Texture> {
  const textureLoader = new THREE.TextureLoader();
  try {
    const texture = await textureLoader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch (error) {
    console.warn(`Failed to load static texture from ${url}:`, error);
    // Create a small placeholder texture so notes still render
    return createPlaceholderTexture();
  }
}

/**
 * Creates a placeholder texture (magenta square) for missing textures.
 * This ensures notes always render even if texture loading fails.
 */
function createPlaceholderTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  // Draw a magenta square to make missing textures obvious
  ctx.fillStyle = "#FF00FF";
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Collection of animated textures that need to be ticked each frame */
class AnimatedTextureManager {
  private animatedTextures: AnimatedTexture[] = [];

  register(texture: AnimatedTexture | THREE.Texture): void {
    if (texture instanceof AnimatedTexture) {
      this.animatedTextures.push(texture);
    }
  }

  /**
   * Updates all animated textures. This is now SYNCHRONOUS for optimal performance.
   */
  tick(): void {
    for (const texture of this.animatedTextures) {
      texture.tick();
    }
  }

  dispose(): void {
    for (const texture of this.animatedTextures) {
      texture.dispose();
    }
    this.animatedTextures = [];
  }
}

/**
 * Custom note types for 6-fret barre notes.
 * These are the only sprites without a dedicated NoteType from scan-chart.
 */
const BARRE1_TYPE = 99991 as const;
const BARRE2_TYPE = 99992 as const;
const BARRE3_TYPE = 99993 as const;
type BarreType = typeof BARRE1_TYPE | typeof BARRE2_TYPE | typeof BARRE3_TYPE;
const barreTypes: readonly BarreType[] = [
  BARRE1_TYPE,
  BARRE2_TYPE,
  BARRE3_TYPE,
];

/** Extended note type that includes custom barre types */
type ExtendedNoteType = NoteType | BarreType;

// Sprites for star power versions are the only sprites without a dedicated NoteFlag
const SP_FLAG = 2147483648;

/** Default interval between progress events in milliseconds */
const DEFAULT_PROGRESS_INTERVAL_MS = 50;

export interface ChartPreviewEvents {
  progress: (percentComplete: number) => void;
  end: () => void;
}

export interface ChartPreviewConfig {
  /** The parsed chart data from scan-chart's parseChartFile function */
  parsedChart: ParsedChart;
  /** Pre-loaded textures from ChartPreview.loadTextures() */
  textures: Awaited<ReturnType<typeof loadTextures>>;
  /** Array of audio file data (Uint8Array) to be played in sync with the preview */
  audioFiles: Uint8Array[];
  /** The instrument to display */
  instrument: Instrument;
  /** The difficulty level to display */
  difficulty: Difficulty;
  /** The amount of time to delay the start of the audio in milliseconds (can be negative) */
  startDelayMs: number;
  /** The length of the longest audio file stem in milliseconds */
  audioLengthMs: number;
  /** The HTML div element where the preview should be rendered */
  container: HTMLDivElement;
  /** Minimum interval between progress events in milliseconds. Defaults to 50ms. */
  progressIntervalMs?: number;
}

/**
 * Renders a chart preview inside a container element, and plays audio files in sync with the render.
 * Works like a video player but generates 3D visualization of the chart in real-time.
 */
export class ChartPreview {
  private eventEmitter = new EventEmitter<ChartPreviewEvents>();

  public instrumentType: InstrumentType;
  private paused = true;
  private scene = new THREE.Scene();
  private highwayTexture: THREE.Texture;
  private camera: ChartCamera;
  private renderer: ChartRenderer;
  private audioManager: AudioManager | SilentAudioManager;
  private notesManager: NotesManager;
  private animatedTextureManager: AnimatedTextureManager;
  private progressIntervalMs: number;
  private lastProgressEmitTime = 0;

  /**
   * Loads textures required for the chart preview.
   * Call this once per instrument type and cache the result for reuse.
   */
  static loadTextures = loadTextures;

  private constructor() {}

  /**
   * Adds an event listener.
   *
   * Available events:
   * - `progress`: called during playback with the current progress (0-1), throttled by progressIntervalMs.
   * - `end`: called when the chart preview ends.
   */
  on<T extends keyof ChartPreviewEvents>(
    event: T,
    listener: ChartPreviewEvents[T]
  ) {
    this.eventEmitter.on(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Removes an event listener.
   */
  off<T extends keyof ChartPreviewEvents>(
    event: T,
    listener: ChartPreviewEvents[T]
  ) {
    this.eventEmitter.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Creates a new ChartPreview instance.
   *
   * @param config - Configuration object for the chart preview
   *
   * Will throw an exception if textures fail to load or if audio decoding fails.
   *
   * @example
   * ```ts
   * import { ChartPreview, ParsedChart } from 'chart-preview'
   * import { parseChartFile, getInstrumentType } from 'scan-chart'
   *
   * // Parse your chart file first
   * const parsedChart = parseChartFile(chartData, format, modifiers)
   *
   * // Load textures for the instrument type
   * const textures = await ChartPreview.loadTextures(getInstrumentType('guitar'))
   *
   * // Create the preview
   * const preview = await ChartPreview.create({
   *   parsedChart,
   *   textures,
   *   audioFiles: [audioData],
   *   instrument: 'guitar',
   *   difficulty: 'expert',
   *   startDelayMs: 0,
   *   audioLengthMs: 180000,
   *   container: document.getElementById('preview-container')
   * })
   *
   * // Control playback
   * await preview.togglePaused()
   * ```
   */
  static async create(config: ChartPreviewConfig) {
    const chartPreview = new ChartPreview();
    chartPreview.instrumentType = getInstrumentType(config.instrument);
    chartPreview.highwayTexture = config.textures.highwayTexture;
    chartPreview.animatedTextureManager =
      config.textures.animatedTextureManager;
    chartPreview.progressIntervalMs =
      config.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
    chartPreview.camera = new ChartCamera(config.container);
    chartPreview.renderer = new ChartRenderer(config.container);
    chartPreview.audioManager = await (isAudioContextSupported()
      ? AudioManager.create(
          config.audioFiles,
          config.startDelayMs,
          config.audioLengthMs
        )
      : SilentAudioManager.create(config.startDelayMs, config.audioLengthMs));
    chartPreview.audioManager.on("end", () =>
      chartPreview.eventEmitter.emit("end")
    );
    chartPreview.notesManager = new NotesManager(
      config.parsedChart,
      config.instrument,
      config.difficulty,
      chartPreview.scene,
      config.textures.noteTextures
    );

    chartPreview.addHighwayToScene(config.textures.highwayTexture);
    chartPreview.addStrikelineToScene(config.textures.strikelineTexture);
    config.container.firstChild?.remove();
    config.container.appendChild(chartPreview.renderer.domElement);

    return chartPreview;
  }

  /**
   * Toggles between playing and paused states.
   */
  async togglePaused() {
    if (this.paused) {
      await this.audioManager.play();
      this.renderer.setAnimationLoop(() => this.animateFrame());
    } else {
      await this.audioManager.pause();
      this.renderer.setAnimationLoop(null);
    }
    this.paused = !this.paused;
  }

  /**
   * Returns whether the preview is currently paused.
   */
  get isPaused() {
    return this.paused;
  }

  /**
   * Moves the playback time to `percentComplete` of the way through the preview.
   * @param percentComplete A number between 0 and 1 (inclusive)
   */
  async seek(percentComplete: number) {
    await this.audioManager.seek(percentComplete);
    this.animateFrame(false);
    this.renderer.setAnimationLoop(null);
    this.paused = true;
  }

  /**
   * Gets or sets the volume (0 to 1).
   * Returns `null` if audio isn't loaded (e.g., using SilentAudioManager).
   */
  set volume(volume: number | null) {
    this.audioManager.volume = volume;
  }
  get volume() {
    return this.audioManager.volume;
  }

  /** Current playback position in milliseconds */
  get chartCurrentTimeMs() {
    return this.audioManager.chartCurrentTimeMs;
  }

  /** Total duration in milliseconds */
  get chartEndTimeMs() {
    return this.audioManager.chartEndTimeMs;
  }

  /**
   * Manually triggers a resize of the camera and renderer.
   * Call this when the container size changes (e.g., entering/exiting fullscreen).
   */
  resize() {
    this.camera.triggerResize();
    this.renderer.triggerResize();
    // Re-render a frame to immediately show the updated size
    if (this.paused) {
      this.animateFrame(false);
    }
  }

  /**
   * Cleans up all resources. Call this when discarding the preview.
   * The preview should not be used after calling dispose().
   */
  dispose() {
    this.eventEmitter.removeAllListeners();
    this.camera.dispose();
    this.renderer.setAnimationLoop(null);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.audioManager.closeAudio();
    this.animatedTextureManager.dispose();
  }

  private addHighwayToScene(highwayTexture: THREE.Texture) {
    const mat = new THREE.MeshBasicMaterial({ map: highwayTexture });

    const geometry = new THREE.PlaneGeometry(
      this.instrumentType === instrumentTypes.drums
        ? 0.9
        : this.instrumentType === instrumentTypes.sixFret
        ? 0.7
        : 1,
      2
    );
    const plane = new THREE.Mesh(geometry, mat);
    plane.position.y = -0.1;
    plane.renderOrder = 1;

    this.scene.add(plane);
  }

  private addStrikelineToScene(strikelineTexture: THREE.Texture) {
    const material = new THREE.SpriteMaterial({
      map: strikelineTexture,
      sizeAttenuation: true,
      transparent: true,
      depthTest: false,
    });
    const aspectRatio =
      strikelineTexture.image.width / strikelineTexture.image.height;
    const scale =
      this.instrumentType === instrumentTypes.sixFret ? 0.141 : 0.19;
    const sprite = new THREE.Sprite(material);
    if (aspectRatio > 1) {
      // Texture is wider than it is tall
      sprite.scale.set(aspectRatio * scale, 1 * scale, 1);
    } else {
      // Texture is taller than it is wide or square
      sprite.scale.set(1 * scale, (1 / aspectRatio) * scale, 1);
    }
    sprite.position.y = -1;
    sprite.renderOrder = 3;

    this.scene.add(sprite);
  }

  private animateFrame(emit = true) {
    this.notesManager.updateDisplayedNotes(
      this.audioManager.chartCurrentTimeMs
    );

    // Update animated textures (for animated WebP notes)
    this.animatedTextureManager.tick();

    // Shift highway position
    const scrollPosition =
      -0.9 *
      (this.audioManager.chartCurrentTimeMs / 1000) *
      (HIGHWAY_DURATION_MS / 1000);
    this.highwayTexture.offset.y = -1 * scrollPosition;
    // Y position goes from -0.1 to 2-0.1

    this.renderer.render(this.scene, this.camera);

    // Throttle progress events to reduce overhead
    if (emit) {
      const now = performance.now();
      if (now - this.lastProgressEmitTime >= this.progressIntervalMs) {
        this.lastProgressEmitTime = now;
        this.eventEmitter.emit(
          "progress",
          this.audioManager.chartCurrentTimeMs /
            this.audioManager.chartEndTimeMs
        );
      }
    }
  }
}

class ChartCamera extends THREE.PerspectiveCamera {
  constructor(private divContainer: HTMLDivElement) {
    super(90, 1 / 1, 0.01, 10);
    this.position.z = 0.8;
    this.position.y = -1.3;
    this.rotation.x = THREE.MathUtils.degToRad(60);
    this.onResize();
    window.addEventListener("resize", this.resizeListener);
  }

  private resizeListener = () => this.onResize();
  private onResize() {
    const width = this.divContainer.offsetWidth ?? window.innerWidth;
    const height = this.divContainer.offsetHeight ?? window.innerHeight;
    this.aspect = width / height;
    this.updateProjectionMatrix();
  }

  /** Manually trigger a resize update */
  triggerResize() {
    this.onResize();
  }

  dispose() {
    window.removeEventListener("resize", this.resizeListener);
    this.clear();
  }
}

class ChartRenderer extends THREE.WebGLRenderer {
  constructor(private divContainer: HTMLDivElement) {
    super({
      antialias: true,
    });
    this.localClippingEnabled = true;
    this.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.onResize();
    window.addEventListener("resize", this.resizeListener);
  }

  private resizeListener = () => this.onResize();
  private onResize() {
    const width = this.divContainer.offsetWidth ?? window.innerWidth;
    const height = this.divContainer.offsetHeight ?? window.innerHeight;
    this.setSize(width, height);
  }

  /** Manually trigger a resize update */
  triggerResize() {
    this.onResize();
  }

  override dispose() {
    window.removeEventListener("resize", this.resizeListener);
    super.dispose();
  }
}

interface AudioManagerEvents {
  end: () => void;
}
class AudioManager {
  private eventEmitter = new EventEmitter();

  private audioCtx: AudioContext;
  private audioBuffers: AudioBuffer[] = [];
  private gainNode: GainNode | null = null;
  private audioSources: AudioBufferSourceNode[] = [];
  private _volume = 0.5;
  private lastSeekChartTimeMs = 0;
  private lastAudioCtxCurrentTime = 0; // Necessary because audioCtx.currentTime doesn't reset to 0 on seek
  private audioLengthMs: number = 0;
  private endEventTimeout: ReturnType<typeof setTimeout> | null = null;
  private _isPaused = true; // Track paused state independently since we share the AudioContext

  private constructor(
    private audioFiles: Uint8Array[],
    private startDelayMs: number,
    private fallbackAudioLengthMs: number
  ) {
    const ctx = getSharedAudioContext();
    if (!ctx) {
      throw new Error("AudioContext is not supported in this environment");
    }
    this.audioCtx = ctx;
    registerInstance();
  }

  /**
   * @param audioFiles The `Uint8Array[]` of the audio files to be played.
   * @param startDelayMs The amount of time to delay the start of the audio. (can be negative)
   * @param fallbackAudioLengthMs The fallback audio length to use if no audio files are provided.
   */
  static async create(
    audioFiles: Uint8Array[],
    startDelayMs: number,
    fallbackAudioLengthMs: number
  ) {
    const audioManager = new AudioManager(
      audioFiles,
      startDelayMs,
      fallbackAudioLengthMs
    );
    await audioManager.decodeAudioFiles();
    return audioManager;
  }

  /**
   * Available events:
   * - `end`: called when the audio playback ends.
   */
  on<T extends keyof AudioManagerEvents>(
    event: T,
    listener: AudioManagerEvents[T]
  ) {
    this.eventEmitter.on(event, listener);
  }

  /** `volume` is a number between 0 and 1 (inclusive). Values outside this range are clamped. */
  set volume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    this._volume = clamped * clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }
  /** `volume` is a number between 0 and 1 (inclusive) */
  get volume() {
    return Math.sqrt(this._volume);
  }

  /** Nonnegative number of milliseconds representing time elapsed since the chart preview start. */
  get chartCurrentTimeMs() {
    // Use our own paused state since we share the AudioContext with other instances
    // and can't rely on audioCtx.state to determine this instance's state
    if (this._isPaused) {
      return this.lastSeekChartTimeMs;
    }
    // outputLatency is not implemented in safari
    const audioLatency =
      (this.audioCtx.baseLatency + (this.audioCtx.outputLatency || 0)) * 1000;
    const audioTimeSinceLastSeekMs =
      (this.audioCtx.currentTime - this.lastAudioCtxCurrentTime) * 1000;
    return this.lastSeekChartTimeMs + audioTimeSinceLastSeekMs - audioLatency;
  }

  /** Nonnegative number of milliseconds representing when the audio ends (and when the chart preview ends). */
  get chartEndTimeMs() {
    // Calculate the theoretical end time based on start delay + audio length
    const theoreticalEndTime = this.startDelayMs + this.audioLengthMs;
    // Ensure we always have a positive end time - use audio length as minimum if startDelay is extremely negative
    // This handles edge cases where chart metadata has invalid/extreme delay values
    return Math.max(
      theoreticalEndTime,
      this.audioLengthMs,
      this.fallbackAudioLengthMs,
      0
    );
  }

  async play() {
    // Resume the shared context if suspended (needed for initial user interaction)
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    // Start audio playback
    this.startAudioSources();
    this._isPaused = false;

    // Start end event timeout for charts without audio
    if (this.audioBuffers.length === 0 && !this.endEventTimeout) {
      const remainingMs = this.chartEndTimeMs - this.chartCurrentTimeMs;
      if (remainingMs > 0) {
        this.endEventTimeout = setTimeout(() => {
          this.eventEmitter.emit("end");
        }, remainingMs);
      }
    }
  }

  async pause() {
    // Record current playback position before stopping
    const currentTime = this.chartCurrentTimeMs;
    this._isPaused = true;
    this.lastSeekChartTimeMs = currentTime;
    this.lastAudioCtxCurrentTime = this.audioCtx.currentTime;

    // Clear end event timeout when pausing
    if (this.endEventTimeout) {
      clearTimeout(this.endEventTimeout);
      this.endEventTimeout = null;
    }

    // Stop all audio sources for this instance only
    // (Don't suspend the shared AudioContext - other instances may be playing)
    this.stopAudioSources();
  }

  closeAudio() {
    this.eventEmitter.removeAllListeners();
    this._isPaused = true;
    // Clear end event timeout
    if (this.endEventTimeout) {
      clearTimeout(this.endEventTimeout);
      this.endEventTimeout = null;
    }
    // Stop all audio sources
    this.stopAudioSources();
    // Don't close the shared context - just unregister this instance
    unregisterInstance();
  }

  /**
   * Decodes audio files into AudioBuffers. Called once during initialization.
   */
  private async decodeAudioFiles() {
    this.audioBuffers = await Promise.all(
      this.audioFiles.map((file) =>
        this.audioCtx.decodeAudioData(file.slice(0).buffer)
      )
    );

    // Use fallback if no audio files or if calculated duration is invalid
    const calculatedLengthMs =
      this.audioBuffers.length > 0
        ? Math.max(...this.audioBuffers.map((b) => b.duration)) * 1000
        : 0;
    this.audioLengthMs =
      calculatedLengthMs > 0 ? calculatedLengthMs : this.fallbackAudioLengthMs;
  }

  /**
   * Stops all currently playing audio sources for this instance.
   */
  private stopAudioSources() {
    for (const source of this.audioSources) {
      source.onended = null; // Prevent false "end" events
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be stopped
      }
    }
    this.audioSources = [];
    this.gainNode?.disconnect();
    this.gainNode = null;
  }

  /**
   * Creates and starts audio sources from the current playback position.
   */
  private startAudioSources() {
    // Stop any existing sources before creating new ones
    this.stopAudioSources();

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this._volume;
    this.gainNode.connect(this.audioCtx.destination);

    let endedCount = 0;
    const audioStartOffsetSeconds =
      (this.lastSeekChartTimeMs - this.startDelayMs) / 1000;

    // If no audio files, use a timeout to emit "end" event
    if (this.audioBuffers.length === 0) {
      // Clear any existing timeout
      if (this.endEventTimeout) {
        clearTimeout(this.endEventTimeout);
        this.endEventTimeout = null;
      }
      // Schedule end event based on remaining time
      const remainingMs = this.chartEndTimeMs - this.lastSeekChartTimeMs;
      if (remainingMs > 0) {
        this.endEventTimeout = setTimeout(() => {
          this.eventEmitter.emit("end");
        }, remainingMs);
      }
    }

    for (const audioBuffer of this.audioBuffers) {
      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.onended = () => {
        endedCount++;
        if (endedCount === this.audioBuffers.length && !this._isPaused) {
          this.eventEmitter.emit("end");
        }
      };
      source.connect(this.gainNode!);
      // When using a shared AudioContext, we need to schedule relative to the current time,
      // not absolute time 0, since the context may have been running for a while
      //
      // audioStartOffsetSeconds calculation:
      // - Positive value: Start audio from this position (audio is "behind" chart time)
      // - Negative value: Delay audio start by |value| seconds (audio hasn't started yet at chart time 0)
      const delaySeconds = Math.abs(Math.min(audioStartOffsetSeconds, 0));
      const when = this.audioCtx.currentTime + delaySeconds;
      const offset = Math.max(audioStartOffsetSeconds, 0);
      source.start(when, offset);
      this.audioSources.push(source);
    }
    this.lastAudioCtxCurrentTime = this.audioCtx.currentTime;
  }

  /**
   * @param percentComplete The progress between the start and end of the preview.
   */
  async seek(percentComplete: number) {
    // Clear end event timeout when seeking
    if (this.endEventTimeout) {
      clearTimeout(this.endEventTimeout);
      this.endEventTimeout = null;
    }

    // Stop existing audio sources
    this.stopAudioSources();

    const chartSeekTimeMs = percentComplete * this.chartEndTimeMs;
    this.lastSeekChartTimeMs = chartSeekTimeMs;
    this.lastAudioCtxCurrentTime = this.audioCtx.currentTime;
    this._isPaused = true;
  }
}

/** Used if window.AudioContext || window.webkitAudioContext is undefined. */
class SilentAudioManager {
  private eventEmitter = new EventEmitter();
  private endEventTimeout: ReturnType<typeof setTimeout> | null = null;

  private isPaused = true;
  private lastResumeChartTimeMs: number;
  private lastResumeClockTimeMs: number;

  private constructor(
    private startDelayMs: number,
    private audioLengthMs: number
  ) {}

  /**
   * @param startDelayMs The amount of time to delay the start of the audio. (can be negative)
   * @param audioLengthMs The length of the longest audio file stem.
   */
  static async create(startDelayMs: number, audioLengthMs: number) {
    const audioManager = new SilentAudioManager(startDelayMs, audioLengthMs);
    await audioManager.seek(0);
    return audioManager;
  }

  /**
   * Available events:
   * - `end`: called when the playback ends.
   */
  on<T extends keyof AudioManagerEvents>(
    event: T,
    listener: AudioManagerEvents[T]
  ) {
    this.eventEmitter.on(event, listener);
  }

  /** `volume` is invalid for silent playback. */
  set volume(_null: number | null) {
    return;
  }
  /** `volume` is invalid for silent playback. */
  get volume() {
    return null;
  }

  /** Nonnegative number of milliseconds representing time elapsed since the chart preview start. */
  get chartCurrentTimeMs() {
    if (this.isPaused) {
      return this.lastResumeChartTimeMs;
    } else {
      return (
        this.lastResumeChartTimeMs +
        performance.now() -
        this.lastResumeClockTimeMs
      );
    }
  }
  /** Nonnegative number of milliseconds representing when the audio ends (and when the chart preview ends). */
  get chartEndTimeMs() {
    // Calculate the theoretical end time based on start delay + audio length
    const theoreticalEndTime = this.startDelayMs + this.audioLengthMs;
    // Ensure we always have a positive end time - use audio length as minimum if startDelay is extremely negative
    return Math.max(theoreticalEndTime, this.audioLengthMs, 0);
  }

  async play() {
    if (this.lastResumeChartTimeMs >= this.chartEndTimeMs - 2) {
      this.lastResumeChartTimeMs = 0; // Restart at the end
    }
    this.lastResumeClockTimeMs = performance.now();
    this.endEventTimeout = setTimeout(() => {
      this.pause();
      this.eventEmitter.emit("end");
    }, this.chartEndTimeMs - this.lastResumeChartTimeMs);
    this.isPaused = false;
  }

  async pause() {
    this.lastResumeChartTimeMs = this.chartCurrentTimeMs;
    if (this.endEventTimeout) {
      clearTimeout(this.endEventTimeout);
    }
    this.isPaused = true;
  }

  closeAudio() {
    this.eventEmitter.removeAllListeners();
    if (this.endEventTimeout) {
      clearTimeout(this.endEventTimeout);
    }
  }

  /**
   * @param percentComplete The progress between the start and end of the preview.
   */
  async seek(percentComplete: number) {
    this.lastResumeChartTimeMs = this.chartEndTimeMs * percentComplete;

    if (!this.isPaused) {
      this.play();
    }
  }
}

/**
 * Handles adding/removing/moving the notes in `scene` at the given `chartCurrentTimeMs` value.
 */
class NotesManager {
  private noteMaterials = new Map<
    ExtendedNoteType,
    Map<number, THREE.SpriteMaterial>
  >();
  private clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 1),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.9),
  ];

  private instrumentType: InstrumentType;
  private noteEvents: NoteEvent[];
  private notes: EventSequence<
    ParsedChart["trackData"][number]["noteEventGroups"][number][number]
  >;

  // TODO: These will be used in a future release to render visual indicators for:
  // - Solo sections (glowing effect or highlighted highway)
  // - Flex lanes (dynamic lane highlighting)
  // - Drum freestyle sections (open note zone indicators)
  private soloSections: EventSequence<
    ParsedChart["trackData"][number]["soloSections"][number]
  >;
  private flexLanes: EventSequence<
    ParsedChart["trackData"][number]["flexLanes"][number]
  >;
  private drumFreestyleSections: EventSequence<
    ParsedChart["trackData"][number]["drumFreestyleSections"][number]
  >;

  private noteGroups = new Map<number, THREE.Group<THREE.Object3DEventMap>>();

  constructor(
    private chartData: ParsedChart,
    private instrument: Instrument,
    private difficulty: Difficulty,
    private scene: THREE.Scene,
    noteTextures: Map<ExtendedNoteType, Map<number, THREE.Texture>>
  ) {
    adjustParsedChart(chartData, instrument, difficulty);
    Object.values(noteTypes).forEach((noteType) =>
      this.noteMaterials.set(noteType, new Map())
    );
    barreTypes.forEach((barreType) =>
      this.noteMaterials.set(barreType, new Map())
    );
    noteTextures.forEach((flagTextures, noteType) => {
      flagTextures.forEach((texture, noteFlagsValue) => {
        this.noteMaterials
          .get(noteType)!
          .set(noteFlagsValue, new THREE.SpriteMaterial({ map: texture }));
      });
    });

    const track = chartData.trackData.find(
      (t) => t.instrument === instrument && t.difficulty === difficulty
    );
    if (!track) {
      throw new Error(
        `Track not found for instrument "${instrument}" at difficulty "${difficulty}"`
      );
    }

    this.instrumentType = getInstrumentType(instrument);
    this.noteEvents = track.noteEventGroups.flat();
    this.notes = new EventSequence(this.noteEvents);
    this.soloSections = new EventSequence(track.soloSections);
    this.flexLanes = new EventSequence(track.flexLanes);
    this.drumFreestyleSections = new EventSequence(track.drumFreestyleSections);
  }

  updateDisplayedNotes(chartCurrentTimeMs: number) {
    const noteStartIndex =
      this.notes.getEarliestActiveEventIndex(chartCurrentTimeMs);

    const renderEndTimeMs = chartCurrentTimeMs + HIGHWAY_DURATION_MS;
    let maxNoteEventIndex = noteStartIndex - 1;
    for (const [noteEventIndex, sprite] of this.noteGroups) {
      if (
        noteEventIndex < noteStartIndex ||
        this.noteEvents[noteEventIndex].msTime > renderEndTimeMs
      ) {
        this.scene.remove(sprite);
        this.noteGroups.delete(noteEventIndex);
      } else {
        sprite.position.y = interpolate(
          this.noteEvents[noteEventIndex].msTime,
          chartCurrentTimeMs,
          renderEndTimeMs,
          -1,
          1
        );
        if (noteEventIndex > maxNoteEventIndex) {
          maxNoteEventIndex = noteEventIndex;
        }
      }
    }

    for (
      let i = maxNoteEventIndex + 1;
      this.noteEvents[i] && this.noteEvents[i].msTime < renderEndTimeMs;
      i++
    ) {
      const note = this.noteEvents[i];

      // Get the material for this note type and flags
      const material = this.noteMaterials.get(note.type)?.get(note.flags);
      if (!material) {
        // Skip notes with missing textures (shouldn't happen, but prevents crashes)
        console.warn(
          `Missing texture for note type ${note.type} with flags ${note.flags}`
        );
        continue;
      }

      const noteGroup = new THREE.Group();
      const scale =
        note.type === noteTypes.kick
          ? 0.045
          : note.type === noteTypes.open &&
            this.instrumentType === instrumentTypes.sixFret
          ? 0.04
          : SCALE;
      const sprite = new THREE.Sprite(material);
      noteGroup.add(sprite);
      sprite.center = new THREE.Vector2(
        note.type === noteTypes.kick ? 0.62 : 0.5,
        note.type === noteTypes.kick ? -0.5 : 0
      );
      const aspectRatio =
        sprite.material.map!.image.width / sprite.material.map!.image.height;
      sprite.scale.set(scale * aspectRatio, scale, scale);
      noteGroup.position.x = calculateNoteXOffset(
        this.instrumentType,
        note.type
      );
      noteGroup.position.y = interpolate(
        note.msTime,
        chartCurrentTimeMs,
        renderEndTimeMs,
        -1,
        1
      );
      noteGroup.position.z = 0;
      sprite.material.clippingPlanes = this.clippingPlanes;
      sprite.material.depthTest = false;
      sprite.material.transparent = true;
      sprite.renderOrder = note.type === noteTypes.kick ? 1 : 4;

      if (note.msLength > 0) {
        const mat = new THREE.MeshBasicMaterial({
          color: calculateColor(note.type),
          side: THREE.DoubleSide,
        });

        mat.clippingPlanes = this.clippingPlanes;
        mat.depthTest = false;
        mat.transparent = true;
        const geometry = new THREE.PlaneGeometry(
          SCALE * (note.type === noteTypes.open ? 5 : 0.3),
          2 * (note.msLength / HIGHWAY_DURATION_MS)
        );
        const plane = new THREE.Mesh(geometry, mat);
        plane.position.y = 0.03 + note.msLength / HIGHWAY_DURATION_MS;
        plane.renderOrder = 2;

        noteGroup.add(plane);
      }

      this.noteGroups.set(i, noteGroup);
      this.scene.add(noteGroup);
    }
  }
}

class EventSequence<
  T extends { msTime: number; msLength: number; type?: NoteType }
> {
  /** Contains the closest events before msTime, grouped by type */
  private lastPrecedingEventIndexesOfType = new Map<
    NoteType | undefined,
    number
  >();
  private lastPrecedingEventIndex = -1;

  /** Assumes `events` are already sorted in `msTime` order. */
  constructor(private events: T[]) {}

  getEarliestActiveEventIndex(startMs: number) {
    if (
      this.lastPrecedingEventIndex !== -1 &&
      startMs < this.events[this.lastPrecedingEventIndex].msTime
    ) {
      this.lastPrecedingEventIndexesOfType = new Map<
        NoteType | undefined,
        number
      >();
      this.lastPrecedingEventIndex = -1;
    }
    while (
      this.events[this.lastPrecedingEventIndex + 1] &&
      this.events[this.lastPrecedingEventIndex + 1].msTime < startMs
    ) {
      this.lastPrecedingEventIndexesOfType.set(
        this.events[this.lastPrecedingEventIndex + 1].type,
        this.lastPrecedingEventIndex + 1
      );
      this.lastPrecedingEventIndex++;
    }

    let earliestActiveEventIndex: number | null = null;
    for (const [, index] of this.lastPrecedingEventIndexesOfType) {
      if (this.events[index].msTime + this.events[index].msLength > startMs) {
        if (
          earliestActiveEventIndex === null ||
          earliestActiveEventIndex > index
        ) {
          earliestActiveEventIndex = index;
        }
      }
    }

    return earliestActiveEventIndex === null
      ? this.lastPrecedingEventIndex + 1
      : earliestActiveEventIndex;
  }
}

export interface LoadTexturesOptions {
  /**
   * Whether to enable animated textures.
   * When true (default), uses ImageDecoder API for animated WebP if available.
   * When false, always loads static textures for better performance.
   * Use `areAnimationsSupported()` to check if animations are supported on the current browser.
   */
  animationsEnabled?: boolean;
}

/**
 * Loads all required textures for the chart preview.
 * @param instrumentType The type of instrument to load textures for
 * @param options Optional configuration for texture loading
 * @returns An object containing highway, strikeline, note textures, and animated texture manager
 */
async function loadTextures(
  instrumentType: InstrumentType,
  options: LoadTexturesOptions = {}
) {
  const { animationsEnabled = true } = options;
  const textureLoader = new THREE.TextureLoader();
  const animatedTextureManager = new AnimatedTextureManager();

  const load = (path: string) =>
    textureLoader.loadAsync("https://static.enchor.us/" + path);

  /**
   * Loads a texture with animation support.
   * Uses ImageDecoder API for animated WebP when available, falls back to static.
   * If animationsEnabled is false, always loads static textures.
   */
  const loadAnimated = async (path: string): Promise<THREE.Texture> => {
    const url = `https://static.enchor.us/preview-${path}.webp`;

    // If animations are disabled, load static texture directly
    if (!animationsEnabled) {
      return loadStaticTexture(url);
    }

    const result = await AnimatedTexture.create(url);

    if (result instanceof AnimatedTexture) {
      animatedTextureManager.register(result);
      return result.texture;
    }

    return result;
  };

  const [highwayTexture, strikelineTexture, noteTextures] = await Promise.all([
    (async () => {
      const texture = await load("preview-highway.png");

      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;

      texture.repeat.set(1, 2);
      return texture;
    })(),
    (async () => {
      switch (instrumentType) {
        case instrumentTypes.drums:
          return await load("preview-drums-strikeline.png");
        case instrumentTypes.sixFret:
          return await load("preview-6fret-strikeline.png");
        case instrumentTypes.fiveFret:
          return await load("preview-5fret-strikeline.png");
      }
    })(),
    (async () => {
      const texturePromises: {
        type: ExtendedNoteType;
        flags: number;
        texture: Promise<THREE.Texture>;
      }[] = [];
      const addTexture = (
        type: ExtendedNoteType,
        flags: number,
        path: string
      ) => {
        const texture = loadAnimated(path);
        texturePromises.push({ type, flags, texture });
        return texture;
      };
      const reuseTexture = (
        type: ExtendedNoteType,
        flags: number,
        texture: Promise<THREE.Texture>
      ) => {
        texturePromises.push({ type, flags, texture });
      };

      if (instrumentType === instrumentTypes.drums) {
        const colors = new Map([
          [noteTypes.redDrum, "red"],
          [noteTypes.yellowDrum, "yellow"],
          [noteTypes.blueDrum, "blue"],
          [noteTypes.greenDrum, "green"],
        ]);
        const dynamicFlags = new Map([
          [noteFlags.none, ""],
          [noteFlags.ghost, "-ghost"],
          [noteFlags.accent, "-accent"],
        ]);
        const spFlags = new Map([
          [noteFlags.none, ""],
          [SP_FLAG, "-sp"],
        ]);

        addTexture(noteTypes.kick, noteFlags.none, "drums-kick");
        addTexture(noteTypes.kick, noteFlags.doubleKick, "drums-kick");
        addTexture(noteTypes.kick, noteFlags.none | SP_FLAG, "drums-kick-sp");
        addTexture(
          noteTypes.kick,
          noteFlags.doubleKick | SP_FLAG,
          "drums-kick-sp"
        );
        for (const [colorKey, colorName] of colors) {
          for (const [dynamicFlagKey, dynamicFlagName] of dynamicFlags) {
            for (const [spFlagKey, spFlagName] of spFlags) {
              addTexture(
                colorKey,
                spFlagKey | dynamicFlagKey | noteFlags.tom,
                `drums-${colorName}-tom${dynamicFlagName}${spFlagName}`
              );
              if (colorKey !== noteTypes.redDrum) {
                addTexture(
                  colorKey,
                  spFlagKey | dynamicFlagKey | noteFlags.cymbal,
                  `drums-${colorName}-cymbal${dynamicFlagName}${spFlagName}`
                );
              }
            }
          }
        }
      } else if (instrumentType === instrumentTypes.sixFret) {
        const lanes = new Map<ExtendedNoteType, string>([
          [noteTypes.open, "open"],
          [noteTypes.black1, "black"],
          [noteTypes.white1, "white"],
          [BARRE1_TYPE, "barre"],
        ]);
        const modifiers = new Map([
          [noteFlags.strum, "-strum"],
          [noteFlags.hopo, "-hopo"],
          [noteFlags.tap, "-tap"],
        ]);
        const spFlags = new Map([
          [noteFlags.none, ""],
          [SP_FLAG, "-sp"],
        ]);

        for (const [laneKey, laneName] of lanes) {
          for (const [modifierKey, modifierName] of modifiers) {
            for (const [spFlagKey, spFlagName] of spFlags) {
              const texturePromise = addTexture(
                laneKey,
                modifierKey | spFlagKey,
                `6fret-${laneName}${modifierName}${spFlagName}`
              );

              // Same texture used for all three lanes
              if (laneKey === noteTypes.black1) {
                reuseTexture(
                  noteTypes.black2,
                  modifierKey | spFlagKey,
                  texturePromise
                );
                reuseTexture(
                  noteTypes.black3,
                  modifierKey | spFlagKey,
                  texturePromise
                );
              } else if (laneKey === noteTypes.white1) {
                reuseTexture(
                  noteTypes.white2,
                  modifierKey | spFlagKey,
                  texturePromise
                );
                reuseTexture(
                  noteTypes.white3,
                  modifierKey | spFlagKey,
                  texturePromise
                );
              } else if (laneKey === BARRE1_TYPE) {
                reuseTexture(
                  BARRE2_TYPE,
                  modifierKey | spFlagKey,
                  texturePromise
                );
                reuseTexture(
                  BARRE3_TYPE,
                  modifierKey | spFlagKey,
                  texturePromise
                );
              }
            }
          }
        }
      } else if (instrumentType === instrumentTypes.fiveFret) {
        const lanes = new Map([
          [noteTypes.open, "open"],
          [noteTypes.green, "green"],
          [noteTypes.red, "red"],
          [noteTypes.yellow, "yellow"],
          [noteTypes.blue, "blue"],
          [noteTypes.orange, "orange"],
        ]);
        const modifiers = new Map([
          [noteFlags.strum, "-strum"],
          [noteFlags.hopo, "-hopo"],
          [noteFlags.tap, "-tap"],
        ]);
        const spFlags = new Map([
          [noteFlags.none, ""],
          [SP_FLAG, "-sp"],
        ]);

        for (const [laneKey, laneName] of lanes) {
          for (let [modifierKey, modifierName] of modifiers) {
            for (const [spFlagKey, spFlagName] of spFlags) {
              if (laneKey === noteTypes.open && modifierKey === noteFlags.tap) {
                modifierName = "-hopo";
                modifierKey = noteFlags.hopo;
              }
              addTexture(
                laneKey,
                modifierKey | spFlagKey,
                `5fret-${laneName}${modifierName}${spFlagName}`
              );
            }
          }
        }
      }

      const textures = await Promise.all(
        texturePromises.map(async (t) => ({
          type: t.type,
          flags: t.flags,
          texture: await t.texture,
        }))
      );

      const textureMap = new Map<
        ExtendedNoteType,
        Map<number, THREE.Texture>
      >();
      Object.values(noteTypes).forEach((noteType) =>
        textureMap.set(noteType, new Map())
      );
      barreTypes.forEach((barreType) => textureMap.set(barreType, new Map()));
      for (const texture of textures) {
        textureMap.get(texture.type)!.set(texture.flags, texture.texture);
      }

      return textureMap;
    })(),
  ]);

  return {
    highwayTexture,
    strikelineTexture,
    noteTextures,
    animatedTextureManager,
  };
}

function adjustParsedChart(
  parsedChart: ParsedChart,
  instrument: Instrument,
  difficulty: Difficulty
) {
  const track = parsedChart.trackData.find(
    (t) => t.instrument === instrument && t.difficulty === difficulty
  )!;
  const starPower = track.starPowerSections;

  if (starPower.length > 0) {
    let starPowerIndex = 0;
    for (const noteGroup of track.noteEventGroups) {
      while (
        starPowerIndex < starPower.length &&
        starPower[starPowerIndex].tick + starPower[starPowerIndex].length <
          noteGroup[0].tick
      ) {
        starPowerIndex++;
      }
      if (starPowerIndex === starPower.length) {
        break;
      }
      if (
        noteGroup[0].tick >= starPower[starPowerIndex].tick &&
        noteGroup[0].tick <
          starPower[starPowerIndex].tick + starPower[starPowerIndex].length
      ) {
        for (const note of noteGroup) {
          note.flags |= SP_FLAG;
        }
      }
    }
  }

  if (getInstrumentType(instrument) === instrumentTypes.sixFret) {
    for (const noteGroup of track.noteEventGroups) {
      let oneCount = 0;
      let twoCount = 0;
      let threeCount = 0;
      for (const note of noteGroup) {
        switch (note.type) {
          case noteTypes.black1:
          case noteTypes.white1:
            oneCount++;
            break;
          case noteTypes.black2:
          case noteTypes.white2:
            twoCount++;
            break;
          case noteTypes.black3:
          case noteTypes.white3:
            threeCount++;
            break;
        }
      }
      if (oneCount > 1) {
        const removed = removeFromArray(
          noteGroup,
          (n) => n.type === noteTypes.black1 || n.type === noteTypes.white1
        );
        // Cast to allow assigning custom barre type
        (removed[0] as { type: ExtendedNoteType }).type = BARRE1_TYPE;
        noteGroup.push(removed[0]);
      }
      if (twoCount > 1) {
        const removed = removeFromArray(
          noteGroup,
          (n) => n.type === noteTypes.black2 || n.type === noteTypes.white2
        );
        (removed[0] as { type: ExtendedNoteType }).type = BARRE2_TYPE;
        noteGroup.push(removed[0]);
      }
      if (threeCount > 1) {
        const removed = removeFromArray(
          noteGroup,
          (n) => n.type === noteTypes.black3 || n.type === noteTypes.white3
        );
        (removed[0] as { type: ExtendedNoteType }).type = BARRE3_TYPE;
        noteGroup.push(removed[0]);
      }
    }
  } else if (getInstrumentType(instrument) === instrumentTypes.drums) {
    for (const noteGroup of track.noteEventGroups) {
      for (const note of noteGroup) {
        if (note.flags & noteFlags.discoNoflip) {
          note.flags &= ~noteFlags.discoNoflip;
        }
        if (note.flags & noteFlags.disco) {
          note.flags &= ~noteFlags.disco;
          switch (note.type) {
            case noteTypes.redDrum:
              note.type = noteTypes.yellowDrum;
              note.flags &= ~noteFlags.tom;
              note.flags |= noteFlags.cymbal;
              break;
            case noteTypes.yellowDrum:
              note.type = noteTypes.redDrum;
              note.flags &= ~noteFlags.cymbal;
              note.flags |= noteFlags.tom;
          }
        }
      }
    }
  }

  return parsedChart;
}

function calculateNoteXOffset(
  instrumentType: InstrumentType,
  noteType: NoteType
) {
  const lane = calculateLane(noteType);
  const leftOffset =
    instrumentType === instrumentTypes.drums
      ? 0.135
      : instrumentType === instrumentTypes.sixFret &&
        noteType !== noteTypes.open
      ? 0.2
      : instrumentType === instrumentTypes.sixFret &&
        noteType === noteTypes.open
      ? 0.035
      : 0.035;

  return (
    leftOffset +
    -(NOTE_SPAN_WIDTH / 2) +
    SCALE +
    ((NOTE_SPAN_WIDTH - SCALE) / 5) * lane
  );
}

function calculateLane(noteType: NoteType) {
  switch (noteType) {
    case noteTypes.green:
    case noteTypes.redDrum:
    case noteTypes.black1:
    case noteTypes.white1:
    case BARRE1_TYPE as NoteType:
      return 0;
    case noteTypes.red:
    case noteTypes.yellowDrum:
    case noteTypes.black2:
    case noteTypes.white2:
    case BARRE2_TYPE as NoteType:
      return 1;
    case noteTypes.yellow:
    case noteTypes.blueDrum:
    case noteTypes.open:
    case noteTypes.kick:
    case noteTypes.black3:
    case noteTypes.white3:
    case BARRE3_TYPE as NoteType:
      return 2;
    case noteTypes.blue:
    case noteTypes.greenDrum:
      return 3;
    case noteTypes.orange:
      return 4;
    default:
      return 0;
  }
}

function calculateColor(noteType: NoteType) {
  switch (noteType) {
    case noteTypes.green:
    case noteTypes.greenDrum:
      return "#01B11A";
    case noteTypes.red:
    case noteTypes.redDrum:
      return "#DD2214";
    case noteTypes.yellow:
    case noteTypes.yellowDrum:
      return "#DEEB52";
    case noteTypes.blue:
    case noteTypes.blueDrum:
      return "#006CAF";
    case noteTypes.open:
      return "#8A0BB5";
    case noteTypes.orange:
      return "#F8B272";
    default:
      return "#FFFFFF";
  }
}

/**
 * Removes all elements from an array that satisfy the predicate and returns the removed elements.
 * Modifies the array in place (similar to lodash's _.remove).
 */
function removeFromArray<T>(array: T[], predicate: (item: T) => boolean): T[] {
  const removed: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      removed.unshift(array.splice(i, 1)[0]);
    }
  }
  return removed;
}

/**
 * Converts `val` from the range (`fromStart`, `fromEnd`) to the range (`toStart`, `toEnd`).
 */
function interpolate(
  val: number,
  fromStart: number,
  fromEnd: number,
  toStart: number,
  toEnd: number
) {
  return (
    ((val - fromStart) / (fromEnd - fromStart)) * (toEnd - toStart) + toStart
  );
}
