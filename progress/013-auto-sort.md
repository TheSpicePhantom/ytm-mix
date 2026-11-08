# Schritt 013: Auto-Sort

## Ziel
Titel so lange umsortieren, bis für den gewählten Modus und die Slider **keine bessere Ø-Passung** mehr erreichbar ist (lokales Optimum).

## Umsetzung
- `sorter.js`: `averageTransitionFit`; bei `opts.auto` längere Suche (bis 45 s), Or-opt bis Länge 4, Paar-Tausch, Abbruch nach 2 Runden ohne Verbesserung.
- `app.js`: Button **Auto-Sort**, Meldung Ø Passung vorher/nachher.
- `app.html`: Button neben „Nach Passung sortieren“.

## Betroffene Dateien
- `sorter.js`
- `app.js`
- `app.html`

## Prüfung
- Durchgeführt: Code-Review.
- Nicht durchgeführt: Laufzeit bei sehr großen Playlists (n > 40).

## Ergebnis
Schnell-Sort (~2,5 s) unverändert; Auto-Sort sucht gründlicher nach höherer Passung.

## Offene Punkte
- Globales Optimum bei vielen Titeln nicht garantiert (heuristische lokale Suche).
