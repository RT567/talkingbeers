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

## Later the same day — one simple form, fudged timings
Rob: the When/How sections didn't make sense; just ask day, start time, finish time, number of stops.
Stay length and stop count "can be fudged" by up to ~30 min; what matters is landing people on specials.
- Panel is one fieldset: Day · Time [start] to [finish] (finish ≤ start wraps past midnight) · Stops · From
  (the ⚑, with "move"). Kick-off defaults to now (rounded to 5 min), finish to 4 h later. The duration and
  "stay N min" inputs are gone.
- Router: target stay = (finish − start) / stops − 5 min (min 15). A venue up to `FUDGE` = 30 min before its
  special starts is still eligible; instead of "wait N min", the previous stop's stay is stretched so you
  walk in as it starts (only the first stop can show a wait). `retime()` does the same with real OSRM legs.
- Verified: 16:00–20:00 × 5 → 5 stops ending 19:47; 21:00–01:00 × 4 → 4 stops ending 01:00; no waits.
- A stuck-drag scare on desktop turned out to be Rob and the agent driving the same Chrome window at once;
  no drag code was changed.
- Shown stop times snap to the quarter hour (`quarterTimes()` in renderRoute; Rob: "21:00–22:00, not
  21:02–21:57"): each stop starts no earlier than the previous one ends or the kick-off (rounded up), and
  lasts ≥ 15 min. Routing still uses exact minutes. Time inputs step 15 min; "now" defaults to the nearest
  quarter. The "wait N min" note was dropped (rounded times make it noise). 18:00–22:00 × 4 →
  18:00–19:00, 19:00–20:00, 20:00–21:00, 21:00–22:00.
- Legend: the "start" swatch shows the ⚑ like the map marker (14 px green disc with the flag).
- A desktop "map follows the mouse" report was Rob and the agent driving the same Chrome window at once;
  no drag code changed.
