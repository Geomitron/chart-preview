---
"chart-preview": major
---

Play charts with a song.ini `delay` or a .chart `Offset` in sync with their audio, and start them at their preview start, as Clone Hero does. The preview no longer reverses either setting, no longer counts a .chart `Offset` twice, and reads a `delay` written with a decimal point as seconds. It now uses a .chart `PreviewStart` when song.ini sets no `preview_start_time`. The timeline starts where the audio starts, so audio that plays before chart time 0 can be heard and sought to.

`getChartTiming(files)` computes the start delay and preview start from a chart's files, and `getPreviewStartMs()` places the preview start on the timeline once the audio's length is known.

To upgrade:

- `startDelayMs` is the chart time at which the audio starts, which is the negative of song.ini's `delay`. If you computed it from `delay` or `Offset` yourself, use `getChartTiming(files)` instead.
- `currentTimeMs` and `durationMs`, and the `currentMs` and `totalMs` of the `player-progress` event, count from the start of the timeline, not from chart time 0.
- `chartCurrentTimeMs` is negative while audio plays before chart time 0.
- `seek()`, progress percentages and `initialSeekPercent` cover the span from `chartStartTimeMs` to `chartEndTimeMs`, not from 0 to `chartEndTimeMs`.
- `chartEndTimeMs` is the chart time at which the audio ends. It is no longer raised to at least the audio's length.
- The loaders start playback at the chart's preview start. Pass an `initialSeekPercent` above 0 to start elsewhere.
- `PreparedChartData` has a required `previewStartAudioMs` field. Pass it to the player's `previewStartAudioMs` option when you load prepared data yourself.
