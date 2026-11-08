# Schritt 001: Analyse über YouTube Music (Tab-Aufnahme)

## Ziel

Audioanalyse ohne Deezer/iTunes: Titel werden im YouTube-Music-Tab abgespielt, Tab-Audio wird aufgenommen und wie bisher in `analysis.js` ausgewertet. Cache primär per `videoId`.

## Umsetzung

- Neuer Adapter `adapter/ytCapture.js`: Tab-Aufnahme via `tabCapture` + `MediaRecorder`, Orchestrierung über Background-Messages.
- `background.js`: `ytPrepareCapture` (Wiedergabe anstoßen), `getTabCaptureStreamId`, Warten auf Tab-Reload nach Watch-Navigation.
- `content.js`: `playVideoId`, `waitForPlayerPlaying`, robustere `videoId`-Extraktion aus Playlist-Zeilen.
- `bridge.js`: Befehl `playVideo` (Navigation zu `watch?v=`).
- `app.js`: Analyse sequenziell (ein Titel nach dem anderen), Cache-Version 4, Schlüssel `v:{videoId}`.
- `manifest.json`: Permission `tabCapture`, Deezer/iTunes-Host-Rechte entfernt, Version 1.1.0.

## Betroffene Dateien

- `adapter/ytCapture.js` – neu, Aufnahme-Adapter
- `background.js` – YT-Capture-Orchestrierung
- `content.js` – Wiedergabe-Steuerung
- `bridge.js` – Watch-Navigation
- `app.js` / `app.html` – UI und Analysepfad
- `manifest.json` – Berechtigungen

## Prüfung

- Durchgeführt: Keine (manuelle Prüfung in Comet/Chromium mit geladener Erweiterung und offenem YT-Music-Tab erforderlich).
- Nicht durchgeführt: End-to-End-Tab-Capture (abhängig von Browser, Tab-Rechten und aktiver YT-Music-Sitzung).

## Ergebnis

Erweiterung analysiert theoretisch direkt aus YouTube Music; Deezer/iTunes werden im Hauptpfad nicht mehr genutzt. Gespeicherte Analyse-Features liegen weiter in `chrome.storage.local` (ohne Audiodaten im Cache).

## Offene Punkte

- Manuelle Textliste ohne Video-IDs kann nicht analysiert werden.
- Nach Cache-Reload ist ▶-Vorschau nur mit frisch analysiertem Titel (Blob in Session), sonst Link zu YT.
- Lange Playlists: ~32 s Echtzeit pro Titel.
- `sources.js` bleibt nur für Text-Normalisierung; Deezer-Code ungenutzt.
