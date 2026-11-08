# Schritt 007: Fortschrittsbalken pro Titel

## Ziel

Während der Analyse pro Zeile Fortschritt und Live-Daten anzeigen (Wiedergabe, Aufnahme-Sekunden, Player-Zeit, Auswertung).

## Umsetzung

- `bridge.js`: `emitProgress` während `recordTrack` und Aufnahme-Ticks (Player-`currentTime`, Sekunden zähler).
- `content.js`: leitet `trackProgress` an die Erweiterung weiter.
- `app.js`: `setTrackProg`, Spalte „Status“ mit Balken, `chrome.runtime.onMessage` für Live-Updates; Vorschau BPM/Camelot nach `analyzeSignal`.
- Kette: `trackId` von App bis Bridge.
- `app.css`: Styles für `.tprog`.

## Betroffene Dateien

- `bridge.js`, `content.js`, `background.js`, `adapter/ytCapture.js`, `app.js`, `app.html`, `app.css`

## Prüfung

- Nicht durchgeführt (manuell).

## Ergebnis

Aktiver Titel zeigt Prozent, Phase und Live-Zeile in der Status-Spalte.

## Offene Punkte

- Keine.
