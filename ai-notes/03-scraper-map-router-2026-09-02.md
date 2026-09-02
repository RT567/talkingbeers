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
   - Drink filter (`is_drink`, tightened later on 2026-09-02 after Rob saw wings deals in a crawl): the **title
     decides**. Happy hour in title/tag passes unless the title names only food ("Oyster Happy Hour" is out);
     a drink word in the title with no food word passes ("$13 Martini Monday"); any food word or food tag in the
     title fails ("Parma & Pint", "$35 Wingsday", "Steak & Wine"); otherwise fall back to EDC drink tags or a
     "$N <drink>" / "<drink> for $N" pattern in the blurb. Word lists: `DRINK_WORDS`, `FOOD_WORDS`, `EDC_*_SLUGS`;
     `NOT_DRINK_RE` strips "beer battered"/"wine sauce". First run: HH 727 raw → 752 windows (per-day
     `timeslots` expanded), EDC 521 venues → 2058 specials; **~1000 drink specials** survive (1602 under the
     first, looser filter).
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
   (pins hit, stops, total value, −travel). Planning uses haversine × 1.3 at 4.8 km/h walking or 14 km/h Lime
   + 3 min per leg to find a bike. **Then the chosen order is routed for real** through OSRM on the FOSSGIS
   public instance (`routing.openstreetmap.de/routed-foot` or `routed-bike`, CORS ok, no key): the itinerary is
   re-timed with real leg durations (a stop that would now miss its window gets a ⚠), each leg gets turn-by-turn
   directions built from OSRM steps, and the map draws the simplified route geometry run through a 20 m
   Douglas-Peucker so it doesn't zigzag kerb to kerb (Rob: "too accurate"). If OSRM fails it falls back to
   straight dashed lines. Base map: Esri World Street Map tiles (OSM default was too busy for Rob; CARTO now
   watermarks "API key required").
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
- Share a crawl via URL hash (day, time, mode, start, pins).
- "Add a special" path for same-day Instagram-style deals (doc 02 §4).
- Venue universe from OSM so pubs with no known deal still show.
- Filter chips are regexes in `specialMatches`; extend when the data shows gaps (e.g. "cider", "seltzer").
- Re-check Lime GBFS monthly (doc 02).
