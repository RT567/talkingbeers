# ai-notes — the story of talkingbeers

Chronological documents for AI agents (and humans) arriving in this directory: what this is, how the
idea evolved and why, how it's built and deployed, and what to watch out for. Written by Claude working
with Rob. Convention: `NN-topic-YYYY-MM-DD.md`, numbered in order; add a new dated doc when you make a
significant change or decision, and keep the newest doc's "current state" accurate.

1. [01-idea-and-data-sources-2026-09-02.md](01-idea-and-data-sources-2026-09-02.md) — the pub-crawl-TSP idea as first stated, open questions, and the research on where cheap-drinks data can be scraped
2. [02-data-source-research-2026-09-02.md](02-data-source-research-2026-09-02.md) — every place drink-specials data could come from, probed and rated; the two real APIs (Happiest Hour, Eat Drink Cheap) documented; Lime/bike-share feed status; recommended scraper design
3. [03-scraper-map-router-2026-09-02.md](03-scraper-map-router-2026-09-02.md) — first working version: the scraper and `data/specials.json` schema, the Leaflet map, the time-windowed crawl router, the scheduled GitHub Action; gotchas and the still-to-do list
