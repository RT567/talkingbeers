# 01 · talkingbeers — the idea, and where drink-specials data could come from

## The idea (2026-09-02, Rob)

> Find discount drinks and cheap drinks in a localised area, then plan a path between them like a
> travelling-salesman problem, for a pub crawl.

So two halves:

1. **Data**: a live-ish list of venues with cheap drinks / happy hours / specials, each with a
   location, the deal, and the days/times it applies. Primary area: Sydney.
2. **Routing**: given a start point, a time window and a walking budget, order a subset of those
   venues so you hit each deal while it's on (a time-windowed orienteering / TSP variant — the
   "while it's on" constraint matters more than pure distance). Output the route on a map.
   **Transport between pubs is on foot or by Lime bike** (Rob, 2026-09-02). So legs need a walking
   time and a Lime time. Rob first said not to bother with live Lime data, then "could be fun", then
   (final, same day): **"should show lime bike locations if possible"**. So: live Lime e-bike
   positions on the map are in scope, best-effort. First probe: Lime's usual GBFS pattern
   `https://data.lime.bike/api/partners/v1/gbfs/<city>/free_bike_status` returns 404 for `sydney`,
   `sydney_au`, `melbourne`, and Sydney isn't in MobilityData's systems.csv — so the real feed (if
   any) has to come from Transport for NSW Open Data or a different Lime slug. Research pending.

Name: "talkingbeers". Tagline (Rob, 2026-09-02, keep verbatim incl. spelling): **"These beers are fuckin talkin. So its time to get walkin"**.

Hosting: live at https://rt567.github.io/talkingbeers/ (repo github.com/RT567/talkingbeers, branch `master`, Pages serves `/`; created 2026-09-02 with a placeholder page; linked from the root landing page). Original hosting expectation, by analogy with the other projects: static site on
GitHub Pages under rt567.github.io/talkingbeers, no server if avoidable (so data either scraped
offline and committed as JSON, or fetched client-side from sources that allow CORS).

## Open questions at the start

- Where does live specials data exist for Sydney, and what can a hobby project legally/technically
  pull from it? (research below)
- Do we need a scheduled scraper (like autotracklist's systemd timer) that commits JSON into the
  repo, or can everything run in the browser?
- How much of the "cheapness" signal is happy-hour times vs. standing cheap prices ($6 schooners
  etc.)? Different sources cover each.

## Data-source research

See **02-data-source-research-2026-09-02.md**. Short version: two community aggregators (The Happiest Hour, Eat Drink Cheap) have undocumented JSON APIs with ~2,000+ Sydney specials each, including coordinates and day/time windows; nothing else comes close. Lime AU GBFS feeds currently 404.
