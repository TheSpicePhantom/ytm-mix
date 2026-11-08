# Schritt 014: Robustere Tonartanalyse

## Ziel
Höhere und aussagekräftigere „Sicherheit“ bei Tonart (z. B. Am mit ~23 %).

## Umsetzung
- `analysis.js`: Mehrfenster-Chroma (7-s-Segmente, 2 s Intro überspringen); Bass-Gewichtung 70–320 Hz; Oberton-Anteile; lautere Frames stärker; robustere Konfidenz (Korrelationsstärke + Rand).
- `app.js`: `CACHE_V = 5` → betroffene Titel neu analysieren oder „Cache ignorieren“.

## Betroffene Dateien
- `analysis.js`
- `app.js`

## Prüfung
- Durchgeführt: Code-Review.
- Nicht durchgeführt: Ground-Truth-Vergleich mit Metadaten.

## Ergebnis
Stabilere Schätzung aus ~32 s YT-Vorschau; volle Sicherheit bei modulationsreichen oder sehr perkussiven Tracks unrealistisch.

## Offene Punkte
- Manuelle Camelot-Korrektur in der Tabelle bleibt sinnvoll bei &lt; 40 % Sicherheit.
- Optional später: längerer Key-Only-Ausschnitt oder externe Referenz (AcousticBrainz o. ä.).
