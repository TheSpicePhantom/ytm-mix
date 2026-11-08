# Schritt 004: YT-Music-DOM aus html-view-actual

## Ziel

Wiedergabe-Logik an reale Playlist-Seite anpassen (Dump „Fuck it, I'm done“).

## Erkenntnisse aus dem HTML-Dump

- URL: `playlist?list=…` ohne `v=` – Video-ID nur über Player-API, nicht aus der Adresszeile.
- Playlist: `ytmusic-playlist-shelf-renderer` → `ytmusic-responsive-list-item-renderer`.
- Titel-Link: `.title-column .title a` mit `watch?v=…&list=…`.
- Abspielen: `ytmusic-play-button-renderer#play-button` in der Zeilen-Overlay-Spalte (nicht nur Titelklick).
- Player: `#movie_player` mit Klasse `paused-mode`, Video `video.html5-main-video` (blob-URL).
- Leiste: `ytmusic-player-bar #play-pause-button`, `aria-label` „Wiedergeben“ / „Pausieren“ (de-DE).
- UI-Zustand: `player-ui-state="PLAYER_BAR_ONLY"` – Player-Seite hidden, Wiedergabe läuft in der Leiste.

## Umsetzung

- `bridge.js`: `getVideoData().video_id`, `paused-mode`, Play-Klick auf Zeilen-`#play-button`, deutsche Play-Labels.
- `content.js`: Video-ID bevorzugt aus `.title-column`-Link.

## Betroffene Dateien

- `bridge.js`, `content.js`

## Prüfung

- Durchgeführt: Statische Analyse des HTML-Dumps.
- Nicht durchgeführt: Live-Test in Comet.

## Ergebnis

Wiedergabe soll auf der Playlist-Seite bleiben und den nativen Play-Button pro Zeile nutzen.

## Offene Punkte

- Zeile muss im DOM sichtbar sein (ggf. vorher scrollen, falls Track weit unten).
