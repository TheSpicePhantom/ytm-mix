# Schritt 009: Fortschritt am Mix-Analyse-Knopf auf YT Music

## Ziel
Analyse-Fortschritt auf `music.youtube.com` über dem Button „♫ Mix-Analyse“ anzeigen, damit kein Tabwechsel zur Analyse-Seite nötig ist.

## Umsetzung
- `content.js`: Panel `#ytmmix-progress` oberhalb des Buttons (Gesamt-Fortschritt, aktueller Titel, Titel-Balken, Detailzeile); Updates aus Bridge-`progress` und `analysisOverlay`-Messages.
- `background.js`: Leitet `analysisOverlay` von der Analyse-Seite an den `sourceTabId`.
- `app.js`: `broadcastOverlay` bei `setTrackProg`, Start/Ende von `runAnalysis`.
- `app.html`: Hint angepasst.

## Betroffene Dateien
- `content.js`
- `background.js`
- `app.js`
- `app.html`

## Prüfung
- Durchgeführt: Statische Code-Prüfung.
- Nicht durchgeführt: Manuelle Extension mit laufender Analyse.

## Ergebnis
Live-Fortschritt sichtbar auf dem YT-Music-Tab; Analyse-Seite kann im Hintergrund bleiben.

## Offene Punkte
- „Analysieren“ muss weiterhin einmal auf der Analyse-Seite gestartet werden (kein Start-Knopf im Overlay).
