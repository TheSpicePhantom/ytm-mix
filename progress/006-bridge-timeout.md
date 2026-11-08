# Schritt 006: Bridge-Timeout und Pause nach Aufnahme

## Ziel

„Bridge Zeitüberschreitung“ vermeiden (Wiedergabe + ~32 s Aufnahme dauern länger als 120 s) und Wiedergabe nach der Aufnahme stoppen.

## Umsetzung

- `content.js`: Bridge-Timeout für `recordTrack` dynamisch (`Aufnahmedauer + 150 s`), Standard 90 s für andere Befehle.
- `bridge.js`: Kein zweites 20-s-Warten, wenn nach `ensurePlayback` schon läuft; Pause nach Aufnahme; Navigation 50 ms verzögert, damit die Bridge-Antwort `reloading` zuerst rausgeht.

## Betroffene Dateien

- `content.js`, `bridge.js`

## Prüfung

- Nicht durchgeführt (manuell).

## Ergebnis

Längere Aufnahme-Pipeline sollte nicht mehr an 120 s scheitern; Player pausiert nach ~32 s.

## Offene Punkte

- Keine.
