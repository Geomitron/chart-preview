/**
 * Shared AudioContext manager for multi-instance support.
 *
 * Browsers limit the number of AudioContexts that can be created (typically ~6).
 * By sharing a single AudioContext across all ChartPreview instances, we can
 * support many more simultaneous players.
 *
 * Each player instance gets its own GainNode connected to the shared context,
 * allowing independent volume control while sharing the same audio destination.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioContextClass =
  typeof window !== "undefined"
    ? window.AudioContext || (window as any).webkitAudioContext
    : null;

let sharedContext: AudioContext | null = null;
let activeInstanceCount = 0;

/**
 * Gets or creates the shared AudioContext.
 * The context is lazily created on first use.
 *
 * @returns The shared AudioContext, or null if AudioContext is not supported
 */
export function getSharedAudioContext(): AudioContext | null {
  if (!AudioContextClass) {
    return null;
  }

  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContextClass();
  }

  return sharedContext;
}

/**
 * Registers a new instance that will use the shared AudioContext.
 * Call this when a player starts using the context.
 */
export function registerInstance(): void {
  activeInstanceCount++;
}

/**
 * Unregisters an instance from the shared AudioContext.
 * When all instances are unregistered, the context can be closed.
 *
 * Note: We don't actually close the context here because:
 * 1. Creating a new context is expensive
 * 2. The user might create new players soon
 * 3. The context uses minimal resources when not playing
 */
export function unregisterInstance(): void {
  activeInstanceCount = Math.max(0, activeInstanceCount - 1);
}

/**
 * Gets the current number of active instances using the shared context.
 */
export function getActiveInstanceCount(): number {
  return activeInstanceCount;
}

/**
 * Checks if AudioContext is supported in the current environment.
 */
export function isAudioContextSupported(): boolean {
  return AudioContextClass !== null;
}

/**
 * Resumes the shared AudioContext if it's suspended.
 * This is needed because browsers require user interaction before playing audio.
 */
export async function resumeSharedContext(): Promise<void> {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === "suspended") {
    await ctx.resume();
  }
}
