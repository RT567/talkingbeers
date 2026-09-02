/* talkingbeers — map + time-windowed pub-crawl router. Plain JS, Leaflet. */
(() => {
const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAYLBL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MODES = { walk: { kmh: 4.8, overhead: 0 }, lime: { kmh: 14, overhead: 3 } };  // overhead = minutes to find/unlock a bike per leg
const DETOUR = 1.3, MAX_WAIT = 30, MIN_DWELL = 15, ITER = 60;
const DEFAULT_START = { lat: -33.8731, lng: 151.2069, name: "Town Hall" };

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const toMin = hhmm => { if (!hhmm) return null; const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmt = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const fmtWin = s => (s.start || s.end) ? `${s.start || "open"}–${s.end || "close"}` : "all day";
const fmtDays = d => d.length === 7 ? "daily" : d.length === 0 ? "" : d.map(x => DAYLBL[DAYS.indexOf(x)]).join(" ");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function km(a, b) {  // haversine
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const travelMin = (a, b, mode) => { const m = MODES[mode]; return km(a, b) * DETOUR / m.kmh * 60 + m.overhead; };

// ---------------------------------------------------------------- state
const state = {
  day: (new Date().getDay() + 6) % 7, mode: "walk", start: { ...DEFAULT_START },
  chips: new Set(), q: "", pins: new Set(), venues: [], route: null,
};

// ---------------------------------------------------------------- data
async function load() {
  const r = await fetch("data/specials.json");
  const doc = await r.json();
  $("gen").textContent = doc.generated.slice(0, 10);
  // group specials into venues; merge same-named venues within 300 m (both sources list many pubs)
  const venues = [];
  const norm = s => (s || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  for (const s of doc.specials) {
    const n = norm(s.venue);
    let v = venues.find(v => v.key === n && km(v, s) < 0.3);
    if (!v) { v = { key: n, name: s.venue, lat: s.lat, lng: s.lng, address: s.address, suburb: s.suburb, specials: [], id: venues.length }; venues.push(v); }
    v.specials.push(s);
  }
  state.venues = venues;
  $("stats").textContent = `${doc.specials.length} drink specials · ${venues.length} venues · Sydney`;
}

// ---------------------------------------------------------------- filters
function specialMatches(s) {
  const text = `${s.deal} ${s.blurb} ${s.tags.join(" ")}`.toLowerCase();
  if (state.q && !text.includes(state.q.toLowerCase()) && !s.venue.toLowerCase().includes(state.q.toLowerCase())) return false;
  for (const c of state.chips) {
    if (c === "happy" && !/happy\s*hour/.test(text)) return false;
    if (c === "beer" && !/\b(beer|schooner|pint|middy|pot|jug|lager|ale|tap|stout|pilsner|tinn|stubb|guinness|coopers|carlton|reschs|tooheys|young henry|4 pines|balter|xxxx|vb)\b/.test(text)) return false;
    if (c === "wine" && !/\b(wine|prosecco|bubbles|champagne|ros[eé]|sparkling|shiraz|chardonnay|sauv|pinot)\b/.test(text)) return false;
    if (c === "cocktail" && !/\b(cocktail|spritz|margarita|marg|martini|negroni|mojito|daiquiri|paloma|sour|highball|sangria|mimosa)\b/.test(text)) return false;
    if (c === "spirit" && !/\b(spirit|gin|vodka|rum|whisk|bourbon|tequila|shot|schnapps|highball)\b/.test(text)) return false;
    if (c === "cheap" && !(s.price != null && s.price <= 10)) return false;
  }
  return true;
}

// windows on the chosen day, as minutes relative to 00:00 of that day (can spill past 1440 or start negative)
function windowsFor(s, day) {
  const out = [];
  for (const dd of [-1, 0, 1]) {
    const d = DAYS[(day + dd + 7) % 7];
    if (!s.days.includes(d)) continue;
    let st = s.start ? toMin(s.start) : 0, en = s.end ? toMin(s.end) : 1440;
    if (en <= st) en += 1440;                 // "16:00–00:00" or "20:00–02:00"
    out.push([st + dd * 1440, en + dd * 1440]);
  }
  return out;
}
const value = s => 10 + (s.price != null ? Math.max(0, 15 - s.price) : 3) + (/happy\s*hour/i.test(s.deal + s.blurb) || s.tags.includes("happy-hour") ? 3 : 0);

// ---------------------------------------------------------------- router (greedy randomised, time windows)
function plan() {
  const T0 = toMin($("t0").value), T1 = T0 + Number($("dur").value) * 60;
  const maxStops = Number($("stops").value), dwellPref = Number($("dwell").value), mode = state.mode;
  // candidates: (venue, special, window) overlapping the crawl
  const cands = [];
  for (const v of state.venues) for (const s of v.specials) {
    if (!specialMatches(s)) continue;
    for (const [ws, we] of windowsFor(s, state.day)) {
      if (we < T0 + MIN_DWELL || ws > T1 - MIN_DWELL) continue;
      cands.push({ v, s, ws, we, val: value(s) + (state.pins.has(v.id) ? 1000 : 0) });
    }
  }
  let best = null;
  for (let it = 0; it < ITER; it++) {
    const visited = new Set(), stops = []; let pos = state.start, t = T0, travelTot = 0, valTot = 0;
    while (stops.length < maxStops) {
      const opts = [];
      for (const c of cands) {
        if (visited.has(c.v.id)) continue;
        const tr = travelMin(pos, c.v, mode);
        let arrive = t + tr, wait = 0;
        if (arrive < c.ws) { wait = c.ws - arrive; if (wait > MAX_WAIT) continue; arrive = c.ws; }
        if (arrive + MIN_DWELL > c.we || arrive + MIN_DWELL > T1) continue;
        opts.push({ c, tr, wait, arrive, score: c.val / (tr + wait + 8) });
      }
      if (!opts.length) break;
      opts.sort((a, b) => b.score - a.score);
      const pick = opts[it === 0 ? 0 : Math.floor(Math.random() * Math.min(3, opts.length))];
      const dwell = Math.max(MIN_DWELL, Math.min(dwellPref, pick.c.we - pick.arrive, T1 - pick.arrive));
      stops.push({ ...pick, leave: pick.arrive + dwell, dist: km(pos, pick.c.v) * DETOUR });
      visited.add(pick.c.v.id); pos = pick.c.v; t = pick.arrive + dwell; travelTot += pick.tr; valTot += pick.c.val;
    }
    const pinsHit = stops.filter(x => state.pins.has(x.c.v.id)).length;
    const key = [pinsHit, stops.length, valTot, -travelTot];
    if (!best || cmp(key, best.key) > 0) best = { stops, key, T0, T1, mode };
  }
  state.route = best;
  renderRoute();
  $("itin").scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (best && best.stops.length) {
    const pts = [state.start, ...best.stops.map(x => x.c.v)];
    fetchRealRoute(pts, best.mode).then(legs => { if (state.route !== best) return; best.real = legs; retime(best); renderRoute(); })
      .catch(e => { console.warn("routing failed, keeping straight lines", e); best.routeError = true; renderRoute(); });
  }
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; return 0; };

// ---------------------------------------------------------------- real routes (OSRM, FOSSGIS public instance)
const OSRM = { walk: "https://routing.openstreetmap.de/routed-foot/route/v1/foot/", lime: "https://routing.openstreetmap.de/routed-bike/route/v1/bike/" };
async function fetchRealRoute(points, mode) {
  const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const r = await fetch(`${OSRM[mode]}${coords}?overview=full&geometries=geojson&steps=true`);
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes?.length) throw new Error(j.code || "no route");
  const route = j.routes[0];
  return route.legs.map((leg, i) => ({
    km: leg.distance / 1000, min: leg.duration / 60 + MODES[mode].overhead,
    shape: leg.steps.flatMap(st => st.geometry.coordinates.map(([lng, lat]) => [lat, lng])),
    steps: leg.steps.map(stepText).filter(Boolean),
  }));
}
function stepText(st) {
  const m = st.maneuver, name = st.name ? ` onto ${st.name}` : "", d = st.distance >= 1000 ? `${(st.distance / 1000).toFixed(1)} km` : `${Math.round(st.distance)} m`;
  const mod = (m.modifier || "").replace("uturn", "U-turn");
  if (m.type === "arrive") return null;
  if (m.type === "depart") return `Head ${mod || "off"}${st.name ? ` along ${st.name}` : ""} · ${d}`;
  const verb = { turn: "Turn", "end of road": "At the end, turn", continue: "Continue", "new name": "Continue", fork: "Keep", merge: "Merge", roundabout: "Take the roundabout", rotary: "Take the roundabout", "exit roundabout": "Exit the roundabout", "on ramp": "Take the ramp", "off ramp": "Take the ramp", notification: "Continue" }[m.type] || "Continue";
  if (mod === "straight") return `Go straight${name} · ${d}`;
  return `${verb} ${mod}${name} · ${d}`;
}
// re-time the planned stops with real leg durations; flag any that now miss their window
function retime(r) {
  let t = r.T0;
  r.stops.forEach((x, i) => {
    const leg = r.real[i], dwell = x.leave - x.arrive;
    x.dist = leg.km; x.tr = leg.min;
    let arrive = t + leg.min; x.wait = 0;
    if (arrive < x.c.ws) { x.wait = x.c.ws - arrive; arrive = x.c.ws; }
    x.arrive = arrive; x.leave = arrive + dwell; x.late = arrive + MIN_DWELL > x.c.we;
    t = x.leave;
  });
}

// ---------------------------------------------------------------- map
const map = L.map("map", { zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120 }).setView([DEFAULT_START.lat, DEFAULT_START.lng], 14);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: 'Tiles © <a href="https://www.esri.com/">Esri</a>' }).addTo(map);
const venueLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => { const d = L.DomUtil.create("div", "legend"); d.innerHTML = '<span class="sw live"></span> on during your window <span class="sw off"></span> other times <span class="sw start"></span> start'; return d; };
legend.addTo(map);
let startMarker = L.marker([state.start.lat, state.start.lng], { icon: L.divIcon({ className: "", html: '<div class="starticon">⚑</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), draggable: true }).addTo(map);
startMarker.on("dragend", () => setStart(startMarker.getLatLng(), "dropped pin"));
map.on("click", e => setStart(e.latlng, "map click"));
function setStart(ll, name) { state.start = { lat: ll.lat, lng: ll.lng, name }; startMarker.setLatLng(ll); $("startlbl").textContent = `${name} (${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)})`; }
$("geo").onclick = () => navigator.geolocation?.getCurrentPosition(p => { setStart({ lat: p.coords.latitude, lng: p.coords.longitude }, "you"); map.setView([p.coords.latitude, p.coords.longitude], 15); }, () => alert("couldn't get your location"));

function crawlWindow() { const T0 = toMin($("t0").value); return [T0, T0 + Number($("dur").value) * 60]; }
function venueOnDuring(v, T0, T1) { return v.specials.some(s => specialMatches(s) && windowsFor(s, state.day).some(([ws, we]) => ws < T1 && we > T0)); }

function renderVenues() {
  venueLayer.clearLayers();
  const [T0, T1] = crawlWindow();
  let on = 0;
  for (const v of state.venues) {
    const matching = v.specials.filter(specialMatches);
    if (!matching.length) continue;
    const live = venueOnDuring(v, T0, T1); if (live) on++;
    const pinned = state.pins.has(v.id);
    const m = L.circleMarker([v.lat, v.lng], { radius: live ? 7 : 4, color: pinned ? "#1d1a14" : live ? "#b8801a" : "#fff", weight: pinned ? 3 : 1.5, fillColor: live ? "#e0a323" : "#7a7a7a", fillOpacity: .9 });
    m.bindPopup(() => popupHtml(v, T0, T1), { maxWidth: 320 });
    m.addTo(venueLayer);
  }
  $("pins").textContent = state.pins.size ? `Pinned: ${[...state.pins].map(id => state.venues[id].name).join(", ")}` : "";
}
function popupHtml(v, T0, T1) {
  const items = v.specials.filter(specialMatches).map(s => {
    const live = windowsFor(s, state.day).some(([ws, we]) => ws < T1 && we > T0);
    return `<li class="${live ? "on" : ""}"><b>${esc(s.deal)}</b> ${s.price != null ? `<span class="p">$${s.price}</span>` : ""}<br><span class="w">${fmtDays(s.days)} ${fmtWin(s)}</span>${s.blurb ? `<br>${esc(s.blurb.slice(0, 160))}${s.blurb.length > 160 ? "…" : ""}` : ""} <a href="${esc(s.source_url)}" target="_blank" rel="noopener">${s.source === "hh" ? "Happiest Hour" : "Eat Drink Cheap"} ↗</a></li>`;
  }).join("");
  const pinned = state.pins.has(v.id);
  return `<div class="popup"><h3>${esc(v.name)}</h3><div class="addr">${esc(v.address)}</div><ul>${items}</ul><div class="pin"><button class="small" onclick="TB.pin(${v.id})">${pinned ? "✕ unpin" : "📌 pin to crawl"}</button></div></div>`;
}

function renderRoute() {
  routeLayer.clearLayers();
  const r = state.route, el = $("itin");
  if (!r || !r.stops.length) { el.innerHTML = `<p class="summary">No specials reachable in that window. Try a longer crawl, another day, or fewer filters.</p>`; return; }
  const pts = [[state.start.lat, state.start.lng], ...r.stops.map(x => [x.c.v.lat, x.c.v.lng])];
  if (r.real) r.real.forEach(leg => L.polyline(leg.shape, { color: "#1d1a14", weight: 4, opacity: .85 }).addTo(routeLayer));
  else L.polyline(pts, { color: "#1d1a14", weight: 3, dashArray: "6 6", opacity: .8 }).addTo(routeLayer);
  r.stops.forEach((x, i) => L.marker([x.c.v.lat, x.c.v.lng], { icon: L.divIcon({ className: "", html: `<div class="numicon">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: 1000 }).bindPopup(() => popupHtml(x.c.v, r.T0, r.T1), { maxWidth: 320 }).addTo(routeLayer));
  map.fitBounds(r.real ? r.real.flatMap(l => l.shape) : pts, { padding: [30, 30] });
  const distTot = r.stops.reduce((a, x) => a + x.dist, 0), trTot = r.stops.reduce((a, x) => a + x.tr + x.wait, 0);
  const modeLbl = r.mode === "walk" ? "walking" : "on a Lime";
  el.innerHTML = `<p class="summary"><b>${r.stops.length} stops</b>, ${distTot.toFixed(1)} km ${modeLbl}, ${Math.round(trTot)} min in transit. ${DAYLBL[state.day]} ${fmt(r.T0)} → ${fmt(r.stops[r.stops.length - 1].leave)}.</p><ol>` +
    r.stops.map((x, i) => `<li><div class="leg">${x.dist.toFixed(1)} km · ${Math.round(x.tr)} min ${modeLbl}${x.wait ? ` · wait ${Math.round(x.wait)} min for it to start` : ""}${r.real?.[i]?.steps.length ? ` <details class="dirs"><summary>directions</summary><ol>${r.real[i].steps.map(t => `<li>${esc(t)}</li>`).join("")}</ol></details>` : ""}</div><b>${i + 1}. ${esc(x.c.v.name)} <span class="t">${fmt(x.arrive)}–${fmt(x.leave)}</span>${x.late ? ' <span class="late">⚠ might miss it</span>' : ""}</b><span class="deal">${esc(x.c.s.deal)}${x.c.s.price != null ? ` · $${x.c.s.price}` : ""}</span><br><span class="t">on ${fmtWin(x.c.s)}</span> · <a href="${esc(x.c.s.source_url)}" target="_blank" rel="noopener">source ↗</a></li>`).join("") +
    `</ol><p class="hint">${r.real ? "Street routes and times from OSRM." : r.routeError ? "Routing server didn't answer — straight-line distances × 1.3." : "Fetching street routes…"} Windows come from venue listings, so ring ahead if it matters.</p>`;
}

// ---------------------------------------------------------------- controls
window.TB = { pin(id) { state.pins.has(id) ? state.pins.delete(id) : state.pins.add(id); map.closePopup(); renderVenues(); } };
const daysEl = $("days");
DAYLBL.forEach((l, i) => { const b = document.createElement("button"); b.textContent = l; b.onclick = () => { state.day = i; syncDays(); renderVenues(); }; daysEl.appendChild(b); });
function syncDays() { [...daysEl.children].forEach((b, i) => b.classList.toggle("on", i === state.day)); }
$("mode").onclick = e => { const b = e.target.closest("button"); if (!b) return; state.mode = b.dataset.v; [...$("mode").children].forEach(x => x.classList.toggle("on", x === b)); };
$("chips").onclick = e => { const b = e.target.closest("button"); if (!b) return; const k = b.dataset.k; state.chips.has(k) ? state.chips.delete(k) : state.chips.add(k); b.classList.toggle("on"); renderVenues(); };
$("q").oninput = () => { state.q = $("q").value.trim(); renderVenues(); };
$("t0").onchange = $("dur").onchange = renderVenues;
$("plan").onclick = plan;
{ const now = new Date(); const m = Math.round(now.getMinutes() / 5) * 5; $("t0").value = `${pad((now.getHours() + Math.floor(m / 60)) % 24)}:${pad(m % 60)}`; }
syncDays();
load().then(renderVenues).catch(e => { $("stats").textContent = "couldn't load data/specials.json"; console.error(e); });
})();
