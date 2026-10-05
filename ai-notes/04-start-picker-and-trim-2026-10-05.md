# Start picker on load; Lime, drink filters and planner hint removed — 2026-10-05

## Rob's brief
Opening the site should drop you straight onto a full-screen map with a small card: "Cheap pub crawl
planner — pick where you want to start". A pin sits fixed at the centre and the map moves under it; a
"Start here" button takes the centre as the crawl start, and only then does the planning UI appear (day
and kick-off time already default to now). Remove the Lime option, the whole "What" section (search +
happy hour/beer/wine/cocktails/spirits/≤$10 chips) and the "Picks specials that are on when you'd get
there…" hint. Must work on phones and desktop. Also drop the "Leaflet | Tiles © Esri" footer.

## What changed
- `body.picking` hides the header and panel; `#picker` (inside `main`, over the map) holds the card, a 📍
  pinned at the map centre (`translate(-50%,-100%)` so its tip is the centre) and the "Start here" button.
  The legend and (on phones) the zoom buttons are hidden while picking. "📍 use my location" in the card
  recentres the map; the user still presses Start here.
- `setPicking(on)` toggles the class, calls `map.invalidateSize()` (the map changes size when the panel
  appears) and re-centres on the same point so nothing jumps. Start row in the panel has a "move" button
  that goes back to picking, centred on the current start. The ⚑ start marker is still draggable.
- Removed: map-click-to-set-start (it fought with tapping venues on phones), Lime mode (`MODES`, bike
  OSRM profile, overhead), all filter code (`specialMatches`, chips, search) and their CSS. Every special
  now counts. The "pinned venues" line moved next to Plan the crawl, with a one-line pin hint when empty.
- Map credit: Leaflet prefix removed; Esri's credit kept (their terms require it) but shrunk to a faded
  9px "© Esri".

## Verified (Chrome, 390×844 mobile and 1280×800 desktop)
Picker shows with no header/panel; pin tip == map centre; dragging the map moves it under the pin;
Start here → panel + header appear, day/time = now; Plan → 5-stop walking crawl with OSRM street routes;
"move" returns to the picker; no horizontal scroll on mobile.
