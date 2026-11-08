# Schritt 003: Wiedergabe über Video-Element (Bridge)

## Ziel

Fehler „Wiedergabe startet nicht“ beheben – Erkennung über echtes `<video>` statt Play-Button-aria-labels.

## Umsetzung

- `bridge.js`: Shadow-DOM-Suche, `video.play()`, Play-Button-Klick, Playlist-Zeilenklick, Fallback Navigation zu `watch?v=`, Befehle `ensurePlayback` und `waitForVideo`.
- `content.js`: Wiedergabe nur noch über Bridge.
- `background.js`: YT-Tab vor Analyse kurz in den Vordergrund (`active: true`).

## Betroffene Dateien

- `bridge.js`
- `content.js`
- `background.js`

## Prüfung

- Durchgeführt: Keine (manuell mit offenem YT-Music-Tab).
- Nicht durchgeführt: E2E.

## Ergebnis

Wiedergabe sollte zuverlässiger starten; Fehlermeldungen nennen pausierten Player oder fehlendes Video-Element.

## Offene Punkte

- Autoplay: ggf. einmal manuell Play im YT-Tab vor der ersten Analyse.
- Beim Wechsel zur Watch-URL springt die Seite pro Titel (erwartetes Verhalten).
