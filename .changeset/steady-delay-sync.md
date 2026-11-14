---
"chart-preview": patch
---

Play charts with a song.ini `delay` or a .chart `Offset` in sync with their audio, as Clone Hero does. The preview no longer reverses either setting, no longer counts a .chart `Offset` twice, and reads a `delay` written with a decimal point as seconds. The timeline now starts where the audio starts, so audio that plays before the first chart beat can be heard and sought to, and the default start position follows `preview_start_time` the way Clone Hero does. `getChartTiming()` and `readSongIniDelay()` compute these positions for callers that pass pre-processed data.
