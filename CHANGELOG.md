# chart-preview

## 1.2.0

### Minor Changes

- 95d0918: Add support for animated note textures and improve fullscreen handling

## 1.1.0

### Minor Changes

- 885a2db: Add note animations (Chrome only)

## 1.0.3

### Patch Changes

- 467db29: Enable play button in ChartPreviewPlayer by removing the disabled attribute, allowing user interaction.

## 1.0.2

### Patch Changes

- 5319db5: Refactor AudioManager to improve audio playback control and state management. Introduce independent paused state tracking, enhance audio source management, and streamline audio decoding process. Update ChartPreviewPlayer styles for better UI responsiveness and remove idle message.

## 1.0.1

### Patch Changes

- 0bbccfe: Enhance audio management by adding fallback audio length and improving start delay handling. Update AudioManager to use fallback length if no audio files are provided, and ensure end event timeout is managed correctly during playback and seeking. Refactor start delay calculation for clarity in main.ts.
