# 02 · Where drink-specials data can come from — research pass, 2026-09-02

Scope (Rob): "ANY sort of discount on any sort of alcoholic drink — happy hours, other specials —
scraping social media, researching online, anything a human or a program could do." Plus live Lime
bike locations if possible. Everything below was probed with curl/python from this PC on
2026-09-02 unless marked *unverified*. Feasibility = 1 (forget it) … 5 (use it today).

## Summary table

| # | Source | What it has | Sydney coverage | Access | Freshness | CORS from browser? | Feas. |
|---|---|---|---|---|---|---|---|
| 1 | **The Happiest Hour** thehappiesthour.com | venue (name, street, suburb, **coordinates**), special title + text, `available.day[]`, `available.time{start,end}`, `cost`, category, boosted flag | **2,186 specials in Sydney**; 3,256 venue pages nationally | **Undocumented JSON API** `GET /api/v3/search/specials?where=sydney&type=special&limit=100&page=N` (also `/api/v3/search/context`, `/api/city`, `/api/venue`); plus every venue page embeds `specials` in `__NEXT_DATA__` | `cache-control: max-age=30`; `updatedAt` per special; venue-submitted (publicans list themselves) | **No** | **5** |
| 2 | **Eat Drink Cheap** eatdrinkcheap.com.au | venue, address, suburb, **lat/lng**, distance, specials with `time` ("4-6pm"), `starts`/`ends`, `day_ids[]`, `when` ("Monday to Friday"), `type_slugs[]` (`happy-hour`, `pints`, `wines`, `cocktails`, `spirits`, …), `blurb`, `modified` | thousands nationally; 138 happy-hour blocks on the Sydney page; `when=now` from the CBD returned 100 venues / 112 live specials within 10 km | **Undocumented JSON API** `GET /api/search.php?lat=-33.87&lng=151.21[&when=now|tonight|remaining|lunch][&types=happy-hour][&page=&limit=]` (`map_limit` 300); server-rendered HTML pages per suburb/day/type as fallback | `cache-control: max-age=600`; "Posted N days ago" per special; venue/community submitted | **No** (403 when an `Origin` header is sent) | **5** |
| 3 | Editorial lists: Time Out, Broadsheet, Urban List, Gourmet Traveller, sydneyexpert.com | prose lists, 30–70 venues each, prices in text, no coordinates | Sydney-specific | HTML scrape + geocode; sydneyexpert has 69 headings / 200 prices | updated a few times a year | no | 3 (good for seeding, bad for "live") |
| 4 | **Beer Me** beerme.au (app) | pubs (lat/lng, Google place id, `happyHourStart/End/Days`), beers with `pintPrice` | **3 pubs in Sydney bbox** (241 nationally, mostly QLD/VIC) | Open, unauthenticated JSON: `api.beerme.au/api/pubs`, `/api/pubs/nearby?lat&lng&radius`, `/api/beers?pub_id=…` | live, crowdsourced | no | 2 (tiny) |
| 5 | **BeerSpy** beerspy.fyi | pub name, beer, size, price, `is_happy_hour`, HH start/end/days, lat/lon | **13 rows in Sydney** (155 nationally) | Supabase `beer_prices` table, anon key in `src/js/config.js` — readable from the browser | crowdsourced, mostly 2025 | **yes** (Supabase) | 2 (tiny) |
| 6 | Schoonr (iOS app) | cheapest schooner per pub, live HH flag | unknown | app only, no web data | — | — | 1 |
| 7 | Pub-group sites (Merivale, Solotel, AVC, ALH) | each venue's "what's on"/happy hour page | Merivale ≈ 100 Sydney venues with a group-wide happy hour ($8 schooners etc.) | per-site HTML scrape; Merivale returns a 212-byte bot block to curl; Solotel/AVC/ALH are WordPress-ish HTML, no JSON | whenever they update | no | 2–3 (one scraper per group) |
| 8 | Instagram / Facebook / TikTok venue posts | the freshest specials (posted the day of) | everything | Official Graph APIs are basically closed for public data (Basic Display API dead since Dec 2024; Graph needs app review, business accounts, 200 calls/h). Scrapers (Instaloader, Apify ~US$1.50/1k results + proxies) work but violate ToS and get accounts banned | live | no | 1–2 for automation; **4 as a human/LLM-in-the-loop** (a person or an agent reads @venue posts weekly and types the deal in) |
| 9 | Reddit r/sydney | occasional "where are the cheap schooners" threads | — | JSON endpoints now 403 without OAuth; official API free at low volume | sporadic | no | 2 |
| 10 | Google Maps / Business Profile | per-place attribute **"Happy hour drinks"** (yes/no), owner "Posts"/offers, reviews mentioning prices | everywhere | not in the official Places API; only via scrapers (SerpAPI, Apify, Outscraper) at cost | live | no | 2 |
| 11 | Yelp Fusion / Foursquare / OSM | Yelp has no happy-hour field; OSM has a `happy_hours=*` tag (rare; Overpass kept returning 406 during tests — *unverified count*); OSM/NSW give the **venue universe** | — | Overpass / data.nsw.gov.au "Liquor licence premises list" CSV (last updated 2024-06, snapshots from 2020) | static | Overpass yes | 3 as a base layer of pubs, 1 for deals |
| 12 | Bottle shops (BWS, Dan Murphy's, Liquorland) | retail specials with `IsOnSpecial`, `WasPrice`, `PromotionType` | national | **BWS**: open JSON `api.bws.com.au/apis/ui/Product/Specials?PageNumber=1&PageSize=50` (no auth; CORS only for bws.com.au). Dan Murphy's API sits behind a Cloudflare challenge | live | no | 4 for a "pre-drinks / takeaway" layer, off-topic for pubs |
| 13 | Untappd / BeerMenus | tap lists with prices where venues subscribe | BeerMenus search for "sydney" returned nothing useful; Untappd venue search 404 | UTFB API needs a paid Premium account | — | — | 1 |

## The two real sources, in detail

### The Happiest Hour (Next.js, MongoDB-shaped ids)
```
GET https://thehappiesthour.com/api/v3/search/specials?where=sydney&type=special&limit=100&page=1
→ { titleResponse:"2186 specials in Sydney", totalRecords, currentPage, maxPageSize, records:[
     { _id, title:"$15.90 Tuesday Burger Special", content, categoryId[], status:"publish",
       available:{ day:["tuesday"], time:{start:"11:30",end:"22:00"}, timeslots:[{day,time:[{start:39600,end:79200}]}] },
       cost:"", updatedAt, dayCount, isSuper, isBoostedListing,
       venue:{ _id, title, slug, street, suburb, postcode, phone, city, coordinates:[lng,lat], venueFeatures[] } } ] }
```
- Categories aren't populated in the search records; use the venue page's `categorySlug` (e.g. `happy-hour`,
  `schnitzel`) or filter on title/content text (`$`, "schooner", "pint", "happy hour", "wine", "cocktail").
- `robots.txt` disallows `/api` for crawlers. Pull it **server-side, gently** (22 pages of 100, once or twice a
  day), not from the browser, and don't republish their photos. No CORS headers.
- Venue pages `https://thehappiesthour.com/venues/sydney/<slug>` list all specials for that venue in
  `__NEXT_DATA__` (`props.pageProps.specials`), plus `venueNearBy`, `events`, `trivias`.
- Cities via `/api/v3/search/context`: sydney, melbourne, adelaide, auckland, brisbane, …

### Eat Drink Cheap (PHP + Cloudflare)
```
GET https://eatdrinkcheap.com.au/api/search.php?lat=-33.87&lng=151.21&when=now&limit=100
→ { ok, mode:"list", meta:{ region:"sydney", radius_km:10, bbox, filters:{when,days,types,q,…}, pagination:{page,limit,map_limit} },
    items:[ { vid, venue, address, suburb, slug, lat, lng, www, booklink, distance_km, matching_count, special_count, time_status,
              specials:[ { sid, name, blurb, time:"4-6pm", starts:"16:00:00", ends:"18:00:00", day_ids:[1..7], when:"Monday to Friday",
                           days_short:"M-F", type_slugs:["happy-hour","pints"], modified, sp_active } ] } ] }
```
- Valid `when`: `any, now, remaining, tonight, lunch`. Unknown params → 400 with a helpful message. Drink-ish
  `type_slugs` seen: `happy-hour, pints, schooners, wines, cocktails, spirits, bougie, bottomless-brunch`.
- `robots.txt`: `Content-Signal: search=yes, ai-train=no` and explicit `Disallow: /` for ClaudeBot, GPTBot,
  CCBot etc. A normal browser UA works; an `Origin` header gets 403. Same rule: server-side, low volume,
  attribute the source, link back to their venue pages (`/sydney/<slug>#specials`).
- Data is community/venue submitted; each special carries a "Posted N days ago" age — use `modified` to decay.

## Recommended approach for talkingbeers

1. **Scheduled scraper, not browser fetches.** Neither aggregator sends CORS headers, so a GitHub Pages site
   can't call them directly. Do what `autotracklist` does: a systemd user timer (or a GitHub Action, since this
   is only ~25 HTTP requests) runs a Python script that pulls Happiest Hour (all Sydney pages) + Eat Drink Cheap
   (a grid of `lat/lng` points over Sydney, `when=any`, radius 10 km each, dedupe on `vid`), normalises both
   into one `data/specials.json` (`venue, lat, lng, deal, price_hint, days[], start, end, source, source_url,
   last_seen`), and commits it into this repo. Twice a day is plenty.
2. **Drink filter.** Keep a special if `type_slugs`/`categorySlug` ∈ {happy-hour, pints, schooners, wines,
   cocktails, spirits, jugs} or the title/blurb matches `/\$\d+(\.\d\d)?\s*(schooner|pint|middy|pot|jug|wine|
   cocktail|spirit|beer|tap)/i`. Drop food-only deals.
3. **Time windows for the router.** Both sources give days + start/end. That's exactly what the TSP-with-time-
   windows needs: each stop has an open interval; the crawl must arrive inside it.
4. **Human/LLM layer for freshness (optional).** The gap in both aggregators is same-day Instagram-style deals.
   A small "add a special" form that writes to a JSON file (or a weekly agent pass over a list of @venue
   accounts) covers it without scraping Meta.
5. **Venue universe** from OSM (`amenity=pub|bar` via Overpass) if you want to show pubs with *no* known deal.
6. Ignore Beer Me/BeerSpy/Schoonr for Sydney until they have data; check again in a few months.

## Lime bikes (and other share bikes) — live positions

- Lime's public GBFS pattern is real (`https://data.lime.bike/api/partners/v1/gbfs/seattle/free_bike_status`
  → 200 with `data.bikes[]` lat/lon) and the community-maintained WoBike doc lists **sydney** as a Lime GBFS
  city, but on 2026-09-02 **every AU/NZ slug returns Lime's own 404** (`sydney`, `melbourne`, `brisbane`,
  `auckland`, plus `_au`/`-au`/`nsw` variants). So Lime's AU feeds appear withdrawn or renamed — *why is
  unverified*. Transport for NSW's Open Data Hub has no bike-share/GBFS/micromobility dataset (CKAN search
  returns only patronage/parking datasets). citybik.es lists 0 networks in Australia. Beam/HelloRide/Ario
  publish nothing public that I could find.
- Remaining options: (a) Lime's private rider API (`web-production.lime.bike/api/rider`, phone-number login,
  documented in WoBike) — works, but it's account-bound, undocumented and against Lime's ToS; (b) ask
  Lime/TfNSW for a partner GBFS URL (the NSW share-bike regulations of 14 Aug 2026 put TfNSW in charge of
  operators, so a public feed may appear); (c) show nothing live and just offer "Lime" as a travel speed.
  Recommendation: (c) now, re-check (b) monthly, never ship (a).

## Sources consulted
eatdrinkcheap.com.au (pages, `/api/search.php`, robots, sitemap) · thehappiesthour.com (pages, `__NEXT_DATA__`,
`/api/v3/*`, sitemaps, robots) · beerme.au + api.beerme.au · beerspy.fyi (+ Supabase) · schoonr.com.au ·
merivale.com, solotel.com.au, ausvenueco.com.au, alhhotels.com.au · timeout.com, broadsheet.com.au,
theurbanlist.com, gourmettraveller.com.au, sydneyexpert.com · api.bws.com.au · api.danmurphys.com.au ·
data.nsw.gov.au CKAN · opendata.transport.nsw.gov.au CKAN · overpass-api.de · data.lime.bike ·
github.com/ubahnverleih/WoBike · api.citybik.es · reddit.com · docs.business.untappd.com · beermenus.com ·
scrapfly.io / socialcrawl.dev write-ups on Instagram/Facebook scraping in 2026 · serpapi.com / apify.com on
Google Maps posts and attributes.
