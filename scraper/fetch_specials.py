#!/usr/bin/env python3
"""
talkingbeers scraper: pull drink specials for Sydney from
  - The Happiest Hour   (thehappiesthour.com, undocumented /api/v3/search/specials)
  - Eat Drink Cheap     (eatdrinkcheap.com.au, undocumented /api/search.php)
normalise both into one schema and write data/specials.json.

Be polite: ~40 requests total, 1 s apart, browser UA, no Origin header.
Run twice a day at most. See ai-notes/02-data-source-research-2026-09-02.md.

usage: python3 scraper/fetch_specials.py [--out data/specials.json] [--raw-dir DIR] [--all]
  --all      keep food-only specials too (default: drink specials only)
  --raw-dir  dump every raw API response there (debugging)
"""
import argparse, json, re, sys, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from pathlib import Path

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0 Safari/537.36")
SLEEP = 1.0

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_ALIASES = {"monday": "mon", "tuesday": "tue", "wednesday": "wed", "thursday": "thu",
               "friday": "fri", "saturday": "sat", "sunday": "sun",
               "mon": "mon", "tue": "tue", "tues": "tue", "wed": "wed", "thu": "thu", "thur": "thu",
               "thurs": "thu", "fri": "fri", "sat": "sat", "sun": "sun"}

DRINK_WORDS = [
    r"happy\s*hours?", "schooners?", "schmidd(y|ies)", "midd(y|ies)", "pints?", "pots?", "jugs?", "beers?",
    r"tap\s*(beer|wine)s?", r"on\s*tap", "wines?", "cocktails?", "spirits?", "spritz(es)?", "margaritas?", "martinis?",
    "negronis?", "sangria", "ciders?", "prosecco", "bubbles", "champagne", "ros[eé]", "gin", "vodka", "rum",
    "whisk(e)?y", "bourbon", "tequila", "shots?", "drinks?", "bevs?", "bevvies", "bottomless", "mimosas?", "sake",
    "seltzers?", "stubb(y|ies)", "tinn(y|ies)", "longnecks?", "growlers?", "schnapps", "aperol", "palomas?",
    "mojitos?", "daiquiris?", r"frozen\s*(margs?|cocktails?|daiquiris?)", "margs?", "slushies?", "pilsner", "lagers?",
    "ales?", "ipas?", "stouts?", r"craft\s*beers?", r"house\s*(red|white|pour)s?", r"bottle\s*of\s*(wine|red|white|bubbles)",
    r"glass\s*of", r"bar\s*tab", "carlton", "tooheys",
    "reschs", "coopers", "vb", "xxxx", r"stone\s*&\s*wood", "balter", r"young\s*henry'?s", r"4\s*pines", "peroni",
    "asahi", "corona", "guinness", "kirin", "heineken", "furphy", r"espresso\s*martinis?", "cans?", "steins?",
    "brews?", "boilermakers?", "pornstar", "sours?", "highballs?", r"long\s*island", r"pi[nñ]a\s*colada",
]
DRINK_RE = re.compile(r"\b(" + "|".join(DRINK_WORDS) + r")\b", re.I)
NOT_DRINK_RE = re.compile(r"beer[- ]?battered|wine[- ]?(sauce|jus|braised)|rum\s*(ball|cake)|gin(ger)|can(s)?\s*of\s*(tuna|coke)", re.I)
EDC_DRINK_SLUGS = {"happy-hour", "pints", "schooners", "wines", "wine", "cocktails", "spirits",
                   "beer", "beers", "drinks", "bottomless-brunch", "bougie", "jugs", "cider",
                   "bubbles", "shots", "tap-beer"}
PRICE_RE = re.compile(r"\$\s?(\d{1,3}(?:\.\d{1,2})?)")


def get_json(url, raw_dir=None, tag=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            break
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f"  ! {e} ({url}) attempt {attempt+1}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    else:
        return None
    if raw_dir and tag:
        Path(raw_dir, tag + ".json").write_bytes(body)
    time.sleep(SLEEP)
    return json.loads(body)


def is_drink(text, slugs=()):
    if any(s in EDC_DRINK_SLUGS for s in slugs):
        return True
    return bool(DRINK_RE.search(NOT_DRINK_RE.sub(" ", text or "")))


def price_hint(text):
    prices = [float(p) for p in PRICE_RE.findall(text or "")]
    prices = [p for p in prices if 1 <= p <= 100]
    return min(prices) if prices else None


def hhmm(s):
    """'16:00:00' / '16:00' / '4pm' -> 'HH:MM' or None"""
    if not s:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})", str(s))
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    return None


def secs_to_hhmm(n):
    n = int(n) % 86400
    return f"{n // 3600:02d}:{(n % 3600) // 60:02d}"


# ---------------------------------------------------------------- Happiest Hour
def fetch_happiest_hour(raw_dir):
    base = "https://thehappiesthour.com/api/v3/search/specials?where=sydney&type=special&limit=100&page="
    records, page = [], 1
    while True:
        j = get_json(base + str(page), raw_dir, f"hh-{page:02d}")
        if not j or not j.get("records"):
            break
        records += j["records"]
        print(f"  HH page {page}: {len(j['records'])} (total so far {len(records)}; '{j.get('titleResponse')}')")
        if len(j["records"]) < 100 or page > 60:
            break
        page += 1
    return records


def norm_hh(rec):
    v = rec.get("venue") or {}
    coords = v.get("coordinates") or [None, None]
    lng, lat = coords[0], coords[1]
    if lat is None or lng is None:
        return []
    av = rec.get("available") or {}
    text = f"{rec.get('title','')} {rec.get('content','')}"
    base = {
        "venue": v.get("title"),
        "address": ", ".join(x for x in [v.get("street"), v.get("suburb"), v.get("postcode")] if x),
        "suburb": v.get("suburb"),
        "lat": round(float(lat), 6), "lng": round(float(lng), 6),
        "deal": (rec.get("title") or "").strip(),
        "blurb": (rec.get("content") or "").strip(),
        "price": price_hint(text),
        "drink": is_drink(text),
        "tags": [],
        "source": "hh",
        "source_url": f"https://thehappiesthour.com/venues/sydney/{v.get('slug')}",
        "updated": (rec.get("updatedAt") or "")[:10],
    }
    out = []
    slots = av.get("timeslots") or []
    if slots:
        # per-day windows: group days by (start,end)
        groups = {}
        for s in slots:
            d = DAY_ALIASES.get(str(s.get("day", "")).lower())
            for t in s.get("time") or []:
                key = (secs_to_hhmm(t["start"]), secs_to_hhmm(t["end"]))
                groups.setdefault(key, set())
                if d: groups[key].add(d)
        for i, ((st, en), ds) in enumerate(sorted(groups.items())):
            out.append({**base, "id": f"hh:{rec['_id']}:{i}",
                        "days": [d for d in DAYS if d in ds], "start": st, "end": en})
    else:
        days = [DAY_ALIASES[d.lower()] for d in (av.get("day") or []) if d.lower() in DAY_ALIASES]
        if any(str(d).lower() in ("everyday", "daily", "all") for d in (av.get("day") or [])):
            days = DAYS[:]
        t = av.get("time") or {}
        out.append({**base, "id": f"hh:{rec['_id']}",
                    "days": [d for d in DAYS if d in days], "start": hhmm(t.get("start")), "end": hhmm(t.get("end"))})
    return out


# ---------------------------------------------------------------- Eat Drink Cheap
# 10 km circles that cover greater Sydney's pub-dense areas.
EDC_GRID = [
    ("cbd", -33.870, 151.210), ("eastern", -33.920, 151.250), ("north-shore", -33.790, 151.180),
    ("manly", -33.780, 151.280), ("dee-why", -33.720, 151.280), ("inner-west", -33.880, 151.100),
    ("parramatta", -33.815, 151.000), ("hornsby", -33.700, 151.100), ("sutherland", -34.030, 151.060),
    ("st-george", -33.970, 151.120), ("liverpool", -33.920, 150.920), ("bankstown", -33.920, 151.030),
    ("blacktown", -33.770, 150.910), ("castle-hill", -33.730, 151.000), ("penrith", -33.750, 150.690),
    ("campbelltown", -34.070, 150.810),
]


def fetch_eat_drink_cheap(raw_dir):
    venues = {}
    for name, lat, lng in EDC_GRID:
        page = 1
        while True:
            url = ("https://eatdrinkcheap.com.au/api/search.php?"
                   + urllib.parse.urlencode({"lat": lat, "lng": lng, "when": "any", "limit": 100, "page": page}))
            j = get_json(url, raw_dir, f"edc-{name}-{page:02d}")
            items = (j or {}).get("items") or []
            new = 0
            for it in items:
                if it.get("vid") not in venues:
                    venues[it["vid"]] = it
                    new += 1
            print(f"  EDC {name} p{page}: {len(items)} venues, {new} new (total {len(venues)})")
            if len(items) < 100 or page > 20:
                break
            page += 1
    return list(venues.values())


def norm_edc(v):
    if v.get("lat") is None or v.get("lng") is None:
        return []
    out = []
    for s in v.get("specials") or []:
        if str(s.get("sp_active", "Yes")).lower() == "no":
            continue
        text = f"{s.get('name','')} {s.get('blurb','')}"
        slugs = s.get("type_slugs") or []
        days = [DAYS[i - 1] for i in sorted(set(s.get("day_ids") or [])) if 1 <= i <= 7]
        out.append({
            "id": f"edc:{s.get('sid')}",
            "venue": v.get("venue"),
            "address": ", ".join(x for x in [v.get("address"), v.get("suburb")] if x),
            "suburb": v.get("suburb"),
            "lat": round(float(v["lat"]), 6), "lng": round(float(v["lng"]), 6),
            "deal": (s.get("name") or "").strip(),
            "blurb": (s.get("blurb") or "").strip(),
            "price": price_hint(text),
            "drink": is_drink(text, slugs),
            "tags": slugs,
            "days": days, "start": hhmm(s.get("starts")), "end": hhmm(s.get("ends")),
            "source": "edc",
            "source_url": f"https://eatdrinkcheap.com.au/{v.get('regionslug','sydney')}/{v.get('slug')}#specials",
            "updated": (s.get("modified") or "")[:10],
        })
    return out


# ---------------------------------------------------------------- main
def replay(raw_dir, prefix, pick, key=None):
    out, seen = [], set()
    for f in sorted(Path(raw_dir).glob(prefix + "*.json")):
        for it in pick(json.loads(f.read_text())):
            k = it.get(key) if key else id(it)
            if k in seen:
                continue
            seen.add(k)
            out.append(it)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/specials.json")
    ap.add_argument("--raw-dir")
    ap.add_argument("--all", action="store_true", help="keep food-only specials too")
    ap.add_argument("--skip", default="", help="comma list of sources to skip: hh,edc")
    ap.add_argument("--from-raw", help="don't hit the network; re-normalise responses saved earlier with --raw-dir")
    a = ap.parse_args()
    if a.raw_dir:
        Path(a.raw_dir).mkdir(parents=True, exist_ok=True)
    skip = set(a.skip.split(","))

    specials, stats = [], {}
    if "hh" not in skip:
        print("Happiest Hour …")
        raw = replay(a.from_raw, "hh-", lambda j: j.get("records") or []) if a.from_raw else fetch_happiest_hour(a.raw_dir)
        n = [x for r in raw for x in norm_hh(r)]
        stats["hh"] = {"raw": len(raw), "normalised": len(n)}
        specials += n
    if "edc" not in skip:
        print("Eat Drink Cheap …")
        raw = replay(a.from_raw, "edc-", lambda j: j.get("items") or [], key="vid") if a.from_raw else fetch_eat_drink_cheap(a.raw_dir)
        n = [x for v in raw for x in norm_edc(v)]
        stats["edc"] = {"raw_venues": len(raw), "normalised": len(n)}
        specials += n

    if not a.all:
        specials = [s for s in specials if s["drink"]]
        for s in specials:
            s.pop("drink", None)
    specials.sort(key=lambda s: (s["venue"] or "", s["deal"], s["id"]))
    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "area": "sydney",
        "sources": {
            "hh": {"name": "The Happiest Hour", "url": "https://thehappiesthour.com/"},
            "edc": {"name": "Eat Drink Cheap", "url": "https://eatdrinkcheap.com.au/"},
        },
        "stats": stats,
        "count": len(specials),
        "specials": specials,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {a.out}: {len(specials)} specials  {stats}")


if __name__ == "__main__":
    main()
