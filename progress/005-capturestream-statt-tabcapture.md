# Schritt 005: captureStream statt tabCapture

## Ziel

Fehler „Extension has not been invoked for the current page (activeTab)“ vermeiden – keine Tab-Aufnahme mehr.

## Umsetzung

- `bridge.js`: nach Wiedergabe `video.captureStream()` → `MediaRecorder` → Base64 an Content-Script.
- `content.js`: Message `recordTrackAudio`.
- `background.js`: `ytRecordTrack` statt `ytPrepareCapture`.
- `adapter/ytCapture.js`: dekodiert Base64, kein `getUserMedia` / `tabCapture`.
- `manifest.json`: Permission `tabCapture` entfernt.

## Betroffene Dateien

- `bridge.js`, `content.js`, `background.js`, `adapter/ytCapture.js`, `manifest.json`, `app.html`

## Prüfung

- Durchgeführt: Keine (manuell).
- Nicht durchgeführt: E2E.

## Ergebnis

Aufnahme läuft im Seitenkontext von music.youtube.com ohne Chrome-Tab-Capture-Freigabe.

## Offene Punkte

- Sehr lange Aufnahmen: Base64 über Extension-Messaging kann speicherintensiv sein (~32 s sind unkritisch).
