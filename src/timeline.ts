import { getPreviewStartMs } from "./chartTiming";

/**
 * A preview's timeline: from where the audio starts (or chart time 0, if the
 * audio starts later) to where the audio ends, in chart time.
 */
export interface Timeline {
  chartStartTimeMs: number;
  chartEndTimeMs: number;
}

/** The timeline's length in milliseconds. */
export function timelineDurationMs(timeline: Timeline): number {
  return timeline.chartEndTimeMs - timeline.chartStartTimeMs;
}

/** Milliseconds from the timeline's start to `chartTimeMs`. */
export function timelineElapsedMs(
  timeline: Timeline,
  chartTimeMs: number
): number {
  return chartTimeMs - timeline.chartStartTimeMs;
}

/** How far `chartTimeMs` is through the timeline, from 0 to 1. */
export function timelineProgress(
  timeline: Timeline,
  chartTimeMs: number
): number {
  return timelineElapsedMs(timeline, chartTimeMs) / timelineDurationMs(timeline);
}

/** The chart time `percentComplete` of the way through the timeline. */
export function timelineChartTimeMs(
  timeline: Timeline,
  percentComplete: number
): number {
  return (
    timeline.chartStartTimeMs + percentComplete * timelineDurationMs(timeline)
  );
}

/**
 * Where a newly loaded preview starts, from 0 to 1. An `initialSeekPercent`
 * above 0 takes precedence over `previewStartAudioMs`.
 *
 * @param preview The loaded preview, with its decoded audio length.
 */
export function getInitialSeekPercent(
  preview: Timeline & { audioLengthMs: number },
  options: {
    startDelayMs: number;
    initialSeekPercent?: number;
    previewStartAudioMs?: number;
  }
): number {
  const percent =
    options.initialSeekPercent !== undefined && options.initialSeekPercent > 0
      ? options.initialSeekPercent
      : options.previewStartAudioMs !== undefined
      ? timelineProgress(
          preview,
          getPreviewStartMs(
            {
              startDelayMs: options.startDelayMs,
              previewStartAudioMs: options.previewStartAudioMs,
            },
            preview.audioLengthMs
          )
        )
      : 0;
  return Math.max(0, Math.min(1, percent));
}
