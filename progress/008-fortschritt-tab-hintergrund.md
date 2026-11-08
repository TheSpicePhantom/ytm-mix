# Schritt 008: Fortschritt bei Tab im Hintergrund

## Ziel
Sichtbarer Fortschritt und klare Erwartung, wenn der YT-Music-Tab durch Tabwechsel gedrosselt wird (Balken blieb bei 22 % stehen).

## Umsetzung
- `app.js`: Lokaler Schätz-Timer während `captureYoutubeAudio` (läuft in der Analyse-Seite, unabhängig von Bridge-`setInterval`).
- `app.html`: Hinweis, YT-Music pro Titel ~40 s im Vordergrund zu lassen.
- `bridge.js`: Zusatz „Tab im Hintergrund!“ in Live-Text der Aufnahme.

## Betroffene Dateien
- `app.js` – `startCaptureProgressFallback`, `analyzeTrack`
- `app.html` – Hint zur Tab-Nutzung
- `bridge.js` – `captureFromVideoElement`

## Prüfung
- Durchgeführt: Code-Review / statisch; Schätz-Logik an `CAPTURE_SEC` und bisherige Prozentstufen angelehnt.
- Nicht durchgeführt: Manuelle Analyse mit absichtlichem Tabwechsel im Browser.

## Ergebnis
Balken soll auch bei gedrosseltem YT-Tab weiterlaufen (Schätzung); echte Player-Zeit weiterhin per Bridge, wenn Tab aktiv.

## Offene Punkte
- Aufnahme selbst kann im Hintergrund weiter verlangsamt/fehlerhaft sein (Chromium-Drosselung); kein technischer Fix ohne dauerhaft aktiven YT-Tab.
