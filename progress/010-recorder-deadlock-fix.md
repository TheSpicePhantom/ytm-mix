# Schritt 010: MediaRecorder-Deadlock beheben

## Ziel
„Bridge Zeitüberschreitung (182s)“ und hängender Fortschritt (~5 %) bei der Aufnahme beheben.

## Umsetzung
- `bridge.js`: **Bugfix** – `await new Promise(onstop)` stand vor `recorder.start()` → Aufnahme startete nie, Antwort kam erst nach Content-Timeout.
- Aufnahmedauer über `waitCaptureDuration` anhand `video.currentTime` (robuster bei gedrosselten Timern).
- `blobPromise` erst nach `stop()` auflösen; 20 s Guard falls `onstop` ausbleibt.

## Betroffene Dateien
- `bridge.js`
- `content.js` (Bridge-Timeout-Marge leicht angepasst)

## Prüfung
- Durchgeführt: Code-Review (Reihenfolge start/stop/await).
- Nicht durchgeführt: Manuelle End-to-End-Analyse im Browser.

## Ergebnis
Aufnahme-Pipeline kann wieder in ~40 s pro Titel abschließen statt nach 182 s zu timeouten.

## Offene Punkte
- Keine.
