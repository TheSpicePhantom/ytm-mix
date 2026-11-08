# YT Music Mix-Analyse (Erweiterung für Comet/Chromium)

Analysiert YouTube-Music-Playlists anhand ihrer Titel (BPM, Tonart, Camelot, Takt, Energie, Groove) und sortiert sie nach Übergangspassung. Das Ergebnis kann als neue private Playlist im eigenen YT-Music-Konto gespeichert werden; die Original-Playlist bleibt unverändert.

## Installation in Comet

1. ZIP entpacken (Ordner `ytm-mix`).
2. In Comet `comet://extensions` öffnen (alternativ `chrome://extensions`).
3. Rechts oben **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** → Ordner `ytm-mix` wählen.
5. Optional: Erweiterung in der Symbolleiste anheften.

## Nutzung

1. `music.youtube.com` öffnen und eine Playlist aufrufen (`/playlist?list=…`).
2. Unten rechts auf **♫ Mix-Analyse** klicken (oder auf das Erweiterungssymbol). Die Erweiterung scrollt die Playlist durch, liest alle Titel und öffnet die Analyse-Seite.
3. **Analysieren** – pro Titel wird im offenen YouTube-Music-Tab abgespielt und ~32 Sekunden Tab-Audio aufgenommen, dann lokal ausgewertet. Der YT-Music-Tab muss offen bleiben; Analyse läuft nacheinander. Ergebnisse werden pro Video-ID zwischengespeichert.
4. Modus und Gewichte wählen → **Nach Passung sortieren**.
5. Prüfen (▶ spielt die Vorschau), bei Bedarf BPM/Camelot per Klick korrigieren, neu sortieren.
6. **Als neue Playlist in YT Music speichern** (YT-Music-Tab muss offen und angemeldet sein) oder als CSV/Textliste exportieren.

Ohne YT Music: Analyse-Seite über das Erweiterungssymbol öffnen, **Liste bearbeiten** und `Interpret - Titel` zeilenweise einfügen.

## Was gemessen wird

| Merkmal | Methode |
|---|---|
| BPM | Spectral-Flux-Onsets, Autokorrelation mit Kammfilter (60–200 BPM, 0,1 BPM Raster), Oktavkorrektur |
| Tonart / Camelot | Feinstimmungs-korrigiertes Chroma aus interpolierten Spektralspitzen, Krumhansl-Kessler-Profile (24 Tonarten) + Konfidenz |
| Takt | Vergleich der Pulsperiodizität über 3 vs. 4 Schläge (Schätzung 4/4 oder 3/4) |
| Groove | Stärke der Pulsperiodizität (0–100 %) |
| Energie | 1–10, kombiniert aus Lautheit, Crest-Faktor, Ereignisdichte, Tempo, Klanghelligkeit (relativ zur Playlist) |

Eigener Test mit 15 bekannten Songs: Tempo fast immer korrekt (teils halbes/doppeltes Tempo, das beim Übergang berücksichtigt wird); Tonart 8/15 exakt, 12/15 exakt oder eine Camelot-Stufe daneben. Grenze: Es werden nur ~32 Sekunden Wiedergabe analysiert, nicht der ganze Song.

## Sortierlogik

Übergangskosten A→B (0 = perfekt) aus gewichteter Summe von:

- **Tonart** (Camelot): gleich 0 · ±1 0,12 · Dur/Moll-Parallel 0,18 · Diagonal 0,40 · ±2 0,45 · +7 0,50 · sonst 0,6–1,0; unsichere Tonarten werden neutralisiert.
- **Tempo**: prozentuale Abweichung (≤1,5 % fast kostenlos, ab ~11 % maximal), halbes/doppeltes Tempo mit Aufschlag.
- **Energie**: Sprunghöhe; Modus „Energie-Aufbau“ bestraft Abfälle und startet ruhig.
- **Groove/Takt**: Taktwechsel und Groove-Unterschied.

Optimierung als offener Pfad: Nearest-Neighbor von jedem Starttitel, danach 2-opt und Or-opt mit O(1)-Deltas (≈0,3 s bei 400 Titeln). Passung je Übergang = 100 × (1 − Kosten).

## Hinweise

- Speichern nutzt die interne YT-Music-Schnittstelle deiner angemeldeten Sitzung (wie die YT-Music-Webseite selbst). Ändert YouTube diese Schnittstelle, kann der Export ausfallen – CSV/Textliste funktionieren unabhängig davon.
- Tab-Aufnahme erfordert Chromium/Comet mit `tabCapture` und eine laufende Wiedergabe in YouTube Music.
- Keine Server, keine Drittanbieter-APIs; Cache liegt lokal im Browser (nur Merkmale, keine Audiodateien).
