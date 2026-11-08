# Schritt 012: Sortiermodus Mood

## Ziel
Modus für einen **stimmungskohärenten** Mix ohne erzwungenen Energiebogen (im Gegensatz zu Aufbau/Abbau/Peak).

## Umsetzung
- `sorter.js`:
  - `trackMoodCoords`: Wärme (Bass/Helligkeit), Intensität (Energie), Puls (Groove), Valenz (Dur/Moll + Spektralzentrum), Dichte (Onsets).
  - `moodCost`: bestraft Sprünge in diesen Dimensionen und Dur/Moll-Wechsel.
  - `transitionCost` bei `mode === 'mood'`: Mood-Anteil mit Gewicht 1,35; Energie-Kurve neutral wie „Bester Fluss“.
  - Start/Ende: mittlere Intensität und Valenz bevorzugt (weicher Einstieg/Ausstieg).
- `app.html`: Option „Mood (Stimmungsfluss)“.
- `app.js`: Übergangstooltip zeigt Mood-Passung.

## Betroffene Dateien
- `sorter.js`
- `app.html`
- `app.js`

## Prüfung
- Durchgeführt: Konsistenz mit vorhandenen Track-Feldern (`t.a`, `camelot`, `energy`, `groove`).
- Nicht durchgeführt: Playlist-Vergleich Mood vs. Flow.

## Ergebnis
Fünfter Sortiermodus; Tonart/Tempo-Slider wirken weiterhin, Mood ergänzt die Bewertung.

## Offene Punkte
- Kein eigener Mood-Regler (fest eingebaute Gewichtung).
