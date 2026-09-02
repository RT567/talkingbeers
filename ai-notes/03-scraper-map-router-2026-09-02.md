# 03 · First working version: scraper, map, crawl router — 2026-09-02

## What landed today (after the research in 01/02)

Live at https://rt567.github.io/talkingbeers/ — three pieces, all in this repo, no server:

1. **`scraper/fetch_specials.py`** (Python 3, stdlib only). Pulls The Happiest Hour (`/api/v3/search/specials`,
   ~8 pages of 100) and Eat Drink Cheap (`/api/search.php`, 16 lat/lng centres × 10 km over greater Sydney, deduped
   on `vid`), keeps drink specials only, normalises both into **`data/specials.json`**:
   ```
   { generated, area, sources{}, stats{}, count,
     specials:[ { id:"hh:<id>"|"edc:<sid>", venue, address, suburb, lat, lng, deal, blurb, price, tags[],
                  days:["mon".."sun"], start:"HH:MM"|null, end:"HH:MM"|null, source:"hh"|"edc", source_url, updated } ] }
   ```
   - `start/end` null = all day. `end <= start` means it runs past midnight (the JS adds 24 h).
   - Drink filter: EDC `type_slugs` ∈ a drink set, or a `\b`-bounded keyword list (`DRINK_WORDS`) over deal+blurb,
     after stripping "beer battered"/"wine sauce"-style false friends (`NOT_DRINK_RE`). First run: HH 727 raw →
     752 windows (per-day `timeslots` expanded), EDC 521 venues → 2058 specials; **1602 drink specials** survive.
   - `price` = cheapest `$` figure that sits right before a drink word, else cheapest `$` figure anywhere. It's a hint.
   - Flags: `--raw-dir DIR` saves every response; `--from-raw DIR` re-normalises without hitting the network (use
     this while tweaking the filter); `--all` keeps food specials (adds a `drink` bool); `--skip hh|edc`.
   - Politeness: browser UA, no Origin header, 1 s between requests, ~40 requests per run. Both sites' robots.txt
     frown on bots hitting `/api`; we're low-volume, attribute them in the footer and link every special back.
2. **`index.html` + `app.js`** — Leaflet 1.9.4 from cdnjs, OSM tiles, no build step. Loads `data/specials.json`,
   merges same-named venues within 300 m (both sources list many pubs → 599 venues), plots circle markers (amber =
   has a special on during the chosen window, grey = other times), popup lists each special with day/time/price
   and a link to the source, plus **pin to crawl**.
3. **Router** (`plan()` in app.js): time-windowed orienteering by randomised greedy. Candidates = (venue, special,
   window) overlapping the crawl window (windows built for day-1/day/day+1 so 22:00 starts and past-midnight
   deals work). From the current position/time, each candidate is scored `value / (travel + wait + 8)` where
   `value = 10 + max(0, 15 - price) + 3 if happy hour` (+1000 if pinned); must arrive ≥15 min before the deal ends,
   wait ≤ 30 min for one to start. 60 runs (first purely greedy, rest pick randomly among the top 3), best by
   (pins hit, stops, total value, −travel). Travel = haversine × 1.3 at 4.8 km/h walking or 14 km/h Lime + 3 min
   per leg to find a bike. Legs are drawn as straight dashed lines — no routing engine.
4. **`.github/workflows/scrape.yml`** — runs the scraper 07:17 and 14:17 Sydney time and commits
   `data/specials.json` if it changed. Needs Actions enabled with write permission on the repo (default for
   `permissions: contents: write`). *Unverified until the first scheduled run* — check the Actions tab tomorrow.

## Decisions / gotchas

- Lime: **no live bike positions** (all AU GBFS feeds 404, see doc 02). Lime is just a travel speed for now.
- No CORS from either source → data must be committed, never fetched client-side. Don't "fix" that.
- Day/time defaults come from the visitor's browser clock, not Sydney time. Fine for people in Sydney.
- Venue merge is by normalised name + 300 m; the same pub with different names in each source stays as two markers.
- `python3 scraper/fetch_specials.py` in the repo root regenerates the data; commit the JSON with the change.

## Still to do / ideas

- Verify the GitHub Action ran and Pages picked up `app.js` (Pages serves `/` on `master`).
- Real walking routes (OSRM/Valhalla public demo servers, or OpenRouteService with a key) instead of straight lines.
- Share a crawl via URL hash (day, time, mode, start, pins).
- "Add a special" path for same-day Instagram-style deals (doc 02 §4).
- Venue universe from OSM so pubs with no known deal still show.
- Filter chips are regexes in `specialMatches`; extend when the data shows gaps (e.g. "cider", "seltzer").
- Re-check Lime GBFS monthly (doc 02).
