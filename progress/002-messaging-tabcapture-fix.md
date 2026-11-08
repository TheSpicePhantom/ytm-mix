# Schritt 002: Messaging und Tab-Capture reparieren

## Ziel

Fehler beim Klick auf „Analysieren“ beheben (`prep` undefined → `prep.error` crasht). Zuverlässige Antworten vom Service Worker und Tab-Capture von der Analyse-Seite aus.

## Umsetzung

- `adapter/ytCapture.js`: `sendMessage` per Callback; klare Meldung bei fehlender Background-Antwort; `getMediaStreamId` direkt auf der Analyse-Seite (Consumer-Tab); zwei Constraint-Varianten für `getUserMedia`.
- `background.js`: `replyAsync` für alle asynchronen Handler; `tabsSend` mit Fehlertext bei fehlendem Content-Script; `ping`-Handler; entfernt separaten `getTabCaptureStreamId`-Handler (läuft in `ytCapture.js`).
- `content.js`: `ping`-Antwort für Diagnose.

## Betroffene Dateien

- `adapter/ytCapture.js`
- `background.js`
- `content.js`

## Prüfung

- Durchgeführt: Keine (manuell: Erweiterung neu laden, YT-Music-Tab F5, dann Analysieren).
- Nicht durchgeführt: E2E in Comet.

## Ergebnis

Statt generischem TypeError sollten verständliche Fehlermeldungen erscheinen; bei korrekt geladenem Hintergrundskript und Content-Script sollte die Wiedergabe-/Capture-Kette starten.

## Offene Punkte

- Falls weiterhin „Keine Antwort vom Erweiterungs-Hintergrund“: Erweiterung unter `comet://extensions` neu laden.
- Falls „Content-Script fehlt“: `music.youtube.com` hart neu laden.
