# Schritt 011: Sortiermodi Energie-Abbau und Energie-Peak

## Ziel
Zusätzlich zu „Energie-Aufbau“ und „Bester Fluss“ weitere Energie-Kurven für die Reihenfolge-Optimierung.

## Umsetzung
- `sorter.js`:
  - **winddown** (Abbau): steigende Energie zwischen Titeln teurer, fallende günstiger; Start mit hoher Energie bevorzugt.
  - **peak** (Bogen): Aufbau Richtung Hochphase (teure Einbrüche vor der Spitze), Plateau oben günstig, am Ende leichter Abbau-Bias.
- `app.html`: Modus-Dropdown um die beiden Optionen erweitert.

## Betroffene Dateien
- `sorter.js`
- `app.html`

## Prüfung
- Durchgeführt: Logik-Spiegelung zu bestehendem `build`-Modus geprüft.
- Nicht durchgeführt: Vergleich Ø Passung vor/nach auf echter Playlist.

## Ergebnis
Vier Sortiermodi wählbar; Energie-Slider wirkt in allen Modi auf Übergangskosten.

## Offene Punkte
- Lokale Suche berücksichtigt `endBias` nur indirekt über Startwahl, nicht bei jedem 2-opt-Schritt.
