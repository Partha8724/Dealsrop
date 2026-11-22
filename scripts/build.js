#!/usr/bin/env node
// Builds the static website from data/prices.json into dist/.
//   node scripts/build.js            -> uses SITE_URL env or config url
//   node scripts/build.js --local    -> for previewing at http://localhost:3000
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "site.json"), "utf8"));
const track = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "track.json"), "utf8"));
const db = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "prices.json"), "utf8"));

const siteUrl = (process.argv.includes("--local") ? "http://localhost:3000" : process.env.SITE_URL || site.url).replace(/\/+$/, "");
const basePath = new URL(siteUrl).pathname.replace(/\/+$/, "");
const abs = (p) => siteUrl + p;
const rel = (p) => basePath + p;
const DAY = 86400e3;
const NOW = Date.parse(db.updatedAt || new Date().toISOString());
const demoProducts = db.mode?.products === "demo";
const demoFlights = db.mode?.flights === "demo";
const allDemo = demoProducts && demoFlights;
const ASSET_V = crypto.createHash("md5").update(String(NOW)).digest("hex").slice(0, 8);

const CITY = { DEL: "Delhi", BOM: "Mumbai", BLR: "Bengaluru", GOI: "Goa", HYD: "Hyderabad", MAA: "Chennai",
  CCU: "Kolkata", PNQ: "Pune", AMD: "Ahmedabad", JAI: "Jaipur", COK: "Kochi", LKO: "Lucknow", PAT: "Patna",
  GAU: "Guwahati", IXC: "Chandigarh", SXR: "Srinagar", TRV: "Thiruvananthapuram", VNS: "Varanasi", IDR: "Indore", BBI: "Bhubaneswar" };
const AIRLINE = { "6E": "IndiGo", AI: "Air India", QP: "Akasa Air", SG: "SpiceJet", IX: "Air India Express", UK: "Vistara" };
const city = (c) => CITY[c] || c;

// ---------- helpers
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const shortId = (id) => crypto.createHash("md5").update(id).digest("hex").slice(0, 6);
const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtDay = (t) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const fmtTime = (t) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

function stats(history) {
  const cur = history[history.length - 1].p;
  const h30 = history.filter((h) => Date.parse(h.t) >= NOW - 30 * DAY);
  const before = history.filter((h) => Date.parse(h.t) <= NOW - 20 * 3600e3);
  const prev = before.length ? before[before.length - 1].p : history[0].p;
  const ps = h30.map((h) => h.p);
  const low = Math.min(...ps), high = Math.max(...ps);
  const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
  return {
    cur, prev, low, high, avg,
    dropAmt: Math.max(0, prev - cur),
    dropPct: prev > cur ? ((prev - cur) / prev) * 100 : 0,
    risePct: cur > prev ? ((cur - prev) / prev) * 100 : 0,
    vsAvgPct: ((avg - cur) / avg) * 100,
    isLowest: cur <= low && high > low,
  };
}

// One value per day for the last N days (last reading of each day) — used for sparklines.
function daily(history, days = 30) {
  const map = new Map();
  for (const h of history) {
    if (Date.parse(h.t) < NOW - days * DAY) continue;
    map.set(h.t.slice(0, 10), h.p);
  }
  return [...map.values()];
}

function sparkSvg(values, cls = "spark") {
  if (values.length < 2) return "";
  const W = 120, H = 32;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join(" ");
  const last = values[values.length - 1], first = values[0];
  return `<svg class="${cls} ${last < first ? "down" : last > first ? "up" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}

// ---------- data
const catBySlug = Object.fromEntries(track.categories.map((c) => [c.slug, c]));
const products = Object.values(db.products)
  .filter((p) => p.history?.length && p.lastSeen && NOW - Date.parse(p.lastSeen) < 3 * DAY)
  .map((p) => ({ ...p, s: stats(p.history), urlPath: `/product/${slugify(p.title)}-${shortId(p.id)}/` }))
  .sort((a, b) => b.s.dropPct - a.s.dropPct || b.s.vsAvgPct - a.s.vsAvgPct);
const isDrop = (p) => p.s.dropPct >= site.minDropPercent;
const drops = products.filter(isDrop);
const routes = Object.values(db.flights)
  .filter((r) => r.history?.length && r.fares?.length)
  .map((r) => {
    const s = stats(r.history);
    const week = r.history.filter((h) => Date.parse(h.t) >= NOW - 7 * DAY).map((h) => h.p);
    const wkAvg = week.reduce((a, b) => a + b, 0) / week.length;
    return { ...r, s, wkAvg, cheap: s.cur < wkAvg * 0.97, urlPath: `/flights/${slugify(`${city(r.origin)}-to-${city(r.destination)}`)}/` };
  })
  .sort((a, b) => a.s.cur - b.s.cur);
const savedToday = drops.reduce((a, p) => a + p.s.dropAmt, 0);
const nextCheck = (() => { const d = new Date(NOW); d.setUTCMinutes(17, 0, 0); if (d.getTime() <= NOW + 60e3) d.setUTCHours(d.getUTCHours() + 1); return d.toISOString(); })();

// ---------- layout
const NAV = [["Price drops", "/deals/"], ["Flights", "/flights/"], ["Train tickets", "/train-tickets/"], ["Watchlist", "/watchlist/"]];

function layout({ title, description, urlPath, body, jsonLd, noindex, ogImage, active, pageClass = "" }) {
  const fullTitle = urlPath === "/" ? `${site.name}: ${site.tagline}` : `${title} | ${site.name}`;
  const robots = noindex || allDemo ? "noindex, follow" : "index, follow, max-image-preview:large";
  const nav = NAV.map(([l, h]) => `<a href="${rel(h)}"${active === h ? ' aria-current="page"' : ""}>${l}${h === "/watchlist/" ? ' <span class="wcount" data-watch-count hidden></span>' : ""}</a>`).join("");
  const demoWhat = [demoProducts && "Product", demoFlights && "flight"].filter(Boolean).join(" and ");
  const banner = demoWhat ? `<div class="demo-banner" role="note">${demoWhat.charAt(0).toUpperCase() + demoWhat.slice(1)} prices here are sample data until API keys are added. They are not real offers.</div>` : "";
  return `<!DOCTYPE html>
<html lang="${site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(urlPath)}">
<meta name="robots" content="${robots}">
${site.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">` : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(urlPath)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#13233B">
<link rel="icon" href="${rel("/favicon.svg")}" type="image/svg+xml">
<link rel="manifest" href="${rel("/manifest.webmanifest")}">
<link rel="preload" href="${rel("/fonts/archivo-latin-wdth-normal.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${rel("/styles.css")}?v=${ASSET_V}">
<script>try{var t=localStorage.getItem("dd-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
${jsonLd ? `<script type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": [].concat(jsonLd) })}</script>` : ""}
</head>
<body class="${pageClass}" data-base="${basePath}" data-updated="${new Date(NOW).toISOString()}" data-next="${nextCheck}" data-min-drop="${site.minDropPercent}">
<a class="skip" href="#main">Skip to content</a>
${banner}
<header class="top"><div class="wrap top-in">
<a class="brand" href="${rel("/")}" aria-label="${esc(site.name)} home"><span class="mark" aria-hidden="true"><b>₹</b><b>↓</b></span><span>${esc(site.name)}</span></a>
<nav class="mainnav" aria-label="Main">${nav}</nav>
<div class="tools">
<button class="searchbtn" type="button" data-open-search aria-label="Search products and flights"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>/</kbd></button>
<button class="iconbtn" type="button" data-theme-toggle aria-label="Switch dark or light mode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
</div></div></header>
<main id="main" class="wrap">${body}</main>
<footer class="foot"><div class="wrap foot-in">
<div><p class="foot-brand">${esc(site.name)}</p><p class="muted">Prices last checked <time datetime="${new Date(NOW).toISOString()}">${fmtTime(NOW)} IST</time>. Prices change often, and the store's price at checkout is the one that applies. We may earn a commission from links on this site.</p></div>
<ul class="foot-links"><li><a href="${rel("/about/")}">About</a></li><li><a href="${rel("/disclosure/")}">Affiliate disclosure</a></li><li><a href="${rel("/train-tickets/")}">Train ticket guide</a></li><li><a href="${rel("/sitemap.xml")}">Sitemap</a></li></ul>
</div></footer>
<nav class="mobnav" aria-label="Main">${NAV.map(([l, h]) => `<a href="${rel(h)}"${active === h ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
<div class="search" data-search hidden><div class="search-box" role="dialog" aria-modal="true" aria-label="Search">
<div class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search products, categories or cities" autocomplete="off" data-search-input aria-label="Search"><kbd>Esc</kbd></div>
<ul class="search-results" data-search-results role="listbox"></ul></div></div>
<div class="toast" data-toast role="status" aria-live="polite" hidden></div>
<script src="${rel("/app.js")}?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

const crumbs = (list) => ({ "@type": "BreadcrumbList", itemListElement: list.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(p) })) });
const crumbHtml = (list) => `<nav class="crumbs" aria-label="Breadcrumb">${list.map(([n, p], i) => i === list.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${rel(p)}">${esc(n)}</a>`).join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;

function write(urlPath, html) {
  const file = urlPath.endsWith("/") ? path.join(OUT, urlPath, "index.html") : path.join(OUT, urlPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- components
function card(p, { feature = false } = {}) {
  const off = p.mrp && p.mrp > p.s.cur ? Math.round(((p.mrp - p.s.cur) / p.mrp) * 100) : 0;
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" width="200" height="200">`
    : `<span class="ph" aria-hidden="true">${esc((catBySlug[p.category]?.name || "?")[0])}</span>`;
  const flag = isDrop(p) ? `<span class="flag drop">${p.s.dropPct.toFixed(0)}% lower than yesterday</span>`
    : p.s.isLowest ? `<span class="flag low">Lowest in 30 days</span>`
    : p.s.risePct >= site.minDropPercent ? `<span class="flag rise">${p.s.risePct.toFixed(0)}% higher than yesterday</span>` : "";
  return `<article class="card${feature ? " feature" : ""}" data-card data-id="${esc(p.id)}" data-cat="${esc(p.category)}" data-price="${p.s.cur}" data-drop="${p.s.dropPct.toFixed(2)}" data-saved="${p.s.dropAmt}" data-low="${p.s.isLowest ? 1 : 0}" style="view-transition-name:c${shortId(p.id)}">
<a class="card-link" href="${rel(p.urlPath)}"><span class="card-img">${img}</span>
<span class="card-body">${flag}<span class="card-title">${esc(p.title)}</span>
<span class="card-price"><strong>${inr(p.s.cur)}</strong>${p.s.dropAmt > 0 ? `<s>${inr(p.s.prev)}</s>` : ""}</span>
<span class="card-meta">${sparkSvg(daily(p.history))}<span>${off ? `${off}% off MRP` : esc(p.source)}</span></span></span></a>
<button class="watch" type="button" data-watch="${esc(p.id)}" data-watch-price="${p.s.cur}" aria-pressed="false" aria-label="Watch price of ${esc(p.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.4-9.3-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.3 6c-2.3 4.6-9.3 9-9.3 9z"/></svg></button>
</article>`;
}
const grid = (list, opts = {}) => list.length
  ? `<div class="grid" data-grid>${list.map((p, i) => card(p, { feature: opts.feature && i === 0 })).join("")}</div>`
  : `<p class="empty">No price has dropped more than ${site.minDropPercent}% since yesterday. Prices are checked every hour, so check again later or <a href="${rel("/deals/")}">browse all tracked products</a>.</p>`;

function board(rows, { caption, cols }) {
  return `<div class="board" data-board><table><caption class="sr-only">${esc(caption)}</caption>
<thead><tr>${cols.map((c) => `<th scope="col" class="${c.cls || ""}">${c.label}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cols.map((c, i) => {
    const v = c.get(r);
    const inner = `<span class="flaps" data-flap="${esc(v)}" data-w="${c.w}">${esc(v)}</span>`;
    return i === 0 && c.href ? `<td class="${c.cls || ""}"><a href="${rel(c.href(r))}">${inner}</a></td>` : `<td class="${c.cls || ""}">${inner}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function liveStrip() {
  return `<div class="live" data-live><span class="pulse" aria-hidden="true"></span><span>Prices checked <time data-rel datetime="${new Date(NOW).toISOString()}">${fmtTime(NOW)}</time></span><span class="live-next">Next check in <b data-countdown>about an hour</b></span></div>`;
}

// ---------- build
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "static"), OUT, { recursive: true });
const sitemap = [];
const page = (urlPath, opts) => { write(urlPath, layout({ urlPath, ...opts })); if (!opts.noindex) sitemap.push(urlPath); };

// Home
const boardRows = (drops.length ? drops : products).slice(0, 12);
const productCols = [
  { label: "Item", w: 26, get: (p) => clip(p.title.replace(/\s*\(demo item\)/i, ""), 26), href: (p) => p.urlPath, cls: "c-item" },
  { label: "Was", w: 8, get: (p) => inr(p.s.prev), cls: "c-was" },
  { label: "Now", w: 8, get: (p) => inr(p.s.cur), cls: "c-now" },
  { label: "Fall", w: 4, get: (p) => (p.s.dropPct ? `↓${Math.round(p.s.dropPct)}%` : "0%"), cls: "c-fall" },
];
page("/", {
  title: site.name, description: site.description, active: "/", pageClass: "home",
  body: `<section class="hero">
<div class="hero-head"><h1>Prices that fell today</h1>
<p class="hero-sub">We check ${products.length} products and ${routes.length} flight routes every hour and keep every price we see. When something gets cheaper, it lands on this board.</p>
${liveStrip()}</div>
${board(boardRows.slice(0, 6), { caption: "Biggest price drops today", cols: productCols })}
<script type="application/json" data-board-rows>${json(boardRows.map((p) => ({ v: productCols.map((c) => c.get(p)), h: rel(p.urlPath) })))}</script>
<div class="hero-foot"><p><strong data-count="${Math.round(savedToday)}">${inr(savedToday)}</strong> cheaper in total across <strong>${drops.length}</strong> price drops since yesterday</p><a class="btn" href="${rel("/deals/")}">See all price drops</a></div>
</section>

<section class="sec"><div class="sec-head"><h2>Biggest drops</h2><a href="${rel("/deals/")}">All ${products.length} products</a></div>
${grid([...drops, ...products.filter((p) => !isDrop(p) && p.s.isLowest)].slice(0, 9), { feature: true })}</section>

<section class="sec split">
<div><div class="sec-head"><h2>Cheapest flights this week</h2><a href="${rel("/flights/")}">All routes</a></div>
${board(routes.slice(0, 5), { caption: "Cheapest flight fares", cols: [
  { label: "Route", w: 18, get: (r) => clip(`${city(r.origin)}-${city(r.destination)}`, 18), href: (r) => r.urlPath, cls: "c-item" },
  { label: "From", w: 7, get: (r) => inr(r.s.cur), cls: "c-now" },
] })}</div>
<div class="train-note"><h2>Booking a train?</h2><p>Train fares are fixed by Indian Railways, so they're the same on every app. What changes is the booking fee. Our guide shows how to pay the least, plus Tatkal timings.</p><a class="btn ghost" href="${rel("/train-tickets/")}">Read the train ticket guide</a></div>
</section>

<section class="sec"><h2>Browse by category</h2><ul class="cats">${track.categories.map((c) => {
    const n = products.filter((p) => p.category === c.slug).length, d = drops.filter((p) => p.category === c.slug).length;
    return `<li><a href="${rel(`/category/${c.slug}/`)}"><span>${esc(c.name)}</span><small>${d ? `${d} cheaper today` : `${n} tracked`}</small></a></li>`;
  }).join("")}</ul></section>`,
  jsonLd: [
    { "@type": "WebSite", name: site.name, url: abs("/"), description: site.description, inLanguage: site.language },
    { "@type": "Organization", name: site.name, url: abs("/"), logo: abs("/favicon.svg") },
  ],
});

// Deals (all products, filterable)
function filters(cats) {
  return `<div class="filters" data-filters>
<div class="chips" role="group" aria-label="Category"><button type="button" class="chip" data-f-cat="" aria-pressed="true">All</button>${cats.map((c) => `<button type="button" class="chip" data-f-cat="${c.slug}" aria-pressed="false">${esc(c.name)}</button>`).join("")}</div>
<div class="frow">
<label class="toggle"><input type="checkbox" data-f-drops checked><span>Cheaper than yesterday</span></label>
<label class="toggle"><input type="checkbox" data-f-low><span>Lowest in 30 days</span></label>
<label class="sel">Sort by <select data-f-sort><option value="drop">Biggest drop</option><option value="saved">Most rupees saved</option><option value="low">Lowest price</option><option value="high">Highest price</option></select></label>
<label class="range">Up to <output data-f-maxout>any price</output><input type="range" data-f-max min="0" max="100" value="100" aria-label="Maximum price"></label>
</div><p class="fcount" data-f-count aria-live="polite"></p></div>`;
}
page("/deals/", {
  title: "Today's Price Drops in India", active: "/deals/",
  description: `${drops.length} products got cheaper since yesterday. Filter by category and price, see 30-day lows, and check the price history before you buy. Updated every hour.`,
  body: `${crumbHtml([["Home", "/"], ["Price drops", "/deals/"]])}<div class="page-head"><h1>Today's price drops</h1>${liveStrip()}</div>
${filters(track.categories)}${grid(products)}`,
  jsonLd: [crumbs([["Home", "/"], ["Price drops", "/deals/"]]),
    { "@type": "ItemList", itemListElement: drops.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(p.urlPath), name: p.title })) }],
});

// Categories
for (const c of track.categories) {
  const list = products.filter((p) => p.category === c.slug);
  const cheapest = list.length ? Math.min(...list.map((p) => p.s.cur)) : 0;
  const d = list.filter(isDrop).length;
  const up = `/category/${c.slug}/`;
  page(up, {
    title: `${c.name} Price Drops & Lowest Prices Today`, active: "/deals/",
    description: `Track ${c.name.toLowerCase()} prices in India: ${list.length} products with full price history${cheapest ? `, from ${inr(cheapest)}` : ""}. ${d} got cheaper since yesterday.`,
    body: `${crumbHtml([["Home", "/"], ["Price drops", "/deals/"], [c.name, up]])}<div class="page-head"><h1>${esc(c.name)}</h1><p class="lede">${list.length} tracked, ${d} cheaper than yesterday${cheapest ? `, cheapest ${inr(cheapest)}` : ""}.</p></div>
${grid(list)}`,
    jsonLd: [crumbs([["Home", "/"], [c.name, up]]),
      { "@type": "ItemList", itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(p.urlPath), name: p.title })) }],
  });
}

// Product pages
for (const p of products) {
  const c = catBySlug[p.category] || { name: "Products", slug: p.category };
  const s = p.s;
  const verdict = s.isLowest ? ["good", "Good time to buy", "This is the lowest price we've seen in 30 days."]
    : s.cur <= s.avg * 0.97 ? ["good", "Fair price", `It's ${Math.round(s.vsAvgPct)}% below its 30-day average.`]
    : s.cur >= s.avg * 1.03 ? ["wait", "Consider waiting", `It's ${Math.round(-s.vsAvgPct)}% above its 30-day average. Watch it and we'll show you when it drops.`]
    : ["ok", "Normal price", "It's close to its 30-day average."];
  const buy = p.url
    ? `<a class="btn big" href="${esc(p.url)}" rel="sponsored nofollow noopener" target="_blank">Check price on ${esc(p.source)}</a>`
    : `<span class="btn big disabled" aria-disabled="true">Sample item, no store link</span>`;
  const trail = [["Home", "/"], [c.name, `/category/${c.slug}/`], [p.title, p.urlPath]];
  const ld = [crumbs(trail)];
  if (!p.demo) ld.push({
    "@type": "Product", name: p.title, ...(p.image ? { image: p.image } : {}), ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    offers: { "@type": "Offer", price: s.cur, priceCurrency: site.currency, url: p.url, availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@type": "Organization", name: p.source } },
  });
  const hist = p.history.map((h) => [Math.round(Date.parse(h.t) / 60e3), h.p]);
  page(p.urlPath, {
    title: `${p.title} Price History & Lowest Price`, active: "/deals/", noindex: p.demo, ogImage: p.image, pageClass: "product-page",
    description: `${p.title} is ${inr(s.cur)} today. 30-day low ${inr(s.low)}, high ${inr(s.high)}. See the full price history before you buy.`,
    body: `${crumbHtml(trail)}<article class="product">
<div class="p-img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" width="400" height="400">` : `<span class="ph big" aria-hidden="true">${esc(c.name[0])}</span>`}</div>
<div class="p-info"><h1>${esc(p.title)}</h1>
<p class="p-price"><strong>${inr(s.cur)}</strong>${p.mrp && p.mrp > s.cur ? `<span>MRP <s>${inr(p.mrp)}</s></span>` : ""}</p>
${s.dropAmt > 0 ? `<p class="flag drop">${inr(s.dropAmt)} (${s.dropPct.toFixed(1)}%) lower than yesterday</p>` : s.risePct > 0 ? `<p class="flag rise">${s.risePct.toFixed(1)}% higher than yesterday</p>` : ""}
<div class="verdict ${verdict[0]}"><strong>${verdict[1]}</strong><span>${verdict[2]}</span></div>
<div class="p-actions">${buy}
<button class="btn ghost" type="button" data-watch="${esc(p.id)}" data-watch-price="${s.cur}" aria-pressed="false"><span data-watch-label>Watch price</span></button>
<button class="btn ghost" type="button" data-share>Copy link</button></div>
<dl class="p-stats"><div><dt>Lowest in 30 days</dt><dd>${inr(s.low)}</dd></div><div><dt>Highest in 30 days</dt><dd>${inr(s.high)}</dd></div><div><dt>30-day average</dt><dd>${inr(s.avg)}</dd></div><div><dt>Last checked</dt><dd>${fmtTime(p.lastSeen)}</dd></div></dl>
</div></article>
<section class="chart-card" data-chart data-label="${esc(p.title)}"><div class="chart-head"><h2>Price history</h2>
<div class="seg" role="group" aria-label="Time range"><button type="button" data-range="7" aria-pressed="false">7 days</button><button type="button" data-range="30" aria-pressed="true">30 days</button><button type="button" data-range="90" aria-pressed="false">90 days</button></div></div>
<div class="chart-box" data-chart-box><noscript><p>Turn on JavaScript to see the price chart.</p></noscript></div>
<script type="application/json" data-chart-data>${json(hist)}</script></section>
<section class="sec"><div class="sec-head"><h2>More ${esc(c.name.toLowerCase())}</h2><a href="${rel(`/category/${c.slug}/`)}">See all</a></div>${grid(products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4))}</section>`,
    jsonLd: ld,
  });
}

// Flights
const routeCols = [
  { label: "From", w: 10, get: (r) => clip(city(r.origin), 10), href: (r) => r.urlPath, cls: "c-item" },
  { label: "To", w: 10, get: (r) => clip(city(r.destination), 10), cls: "c-to" },
  { label: "Cheapest", w: 7, get: (r) => inr(r.s.cur), cls: "c-now" },
  { label: "vs week", w: 4, get: (r) => { const d = Math.round(((r.s.cur - r.wkAvg) / r.wkAvg) * 100); return d > 0 ? `↑${d}%` : d < 0 ? `↓${-d}%` : "0%"; }, cls: "c-fall" },
];
page("/flights/", {
  title: "Cheapest Flight Tickets in India Today", active: "/flights/",
  description: `Cheapest one-way fares on ${routes.length} popular Indian routes, checked every hour. Find the lowest flight prices for the next 2 months.`,
  body: `${crumbHtml([["Home", "/"], ["Flights", "/flights/"]])}<div class="page-head"><h1>Cheapest flights</h1><p class="lede">The lowest one-way fare we found on each route for the next two months. The last column compares it with the route's average this week.</p>${liveStrip()}</div>
${board(routes, { caption: "Cheapest fare on each route", cols: routeCols })}`,
  jsonLd: [crumbs([["Home", "/"], ["Flights", "/flights/"]])],
});
for (const r of routes) {
  const name = `${city(r.origin)} to ${city(r.destination)}`;
  const trail = [["Home", "/"], ["Flights", "/flights/"], [name, r.urlPath]];
  const rows = r.fares.map((f) => `<tr><td>${fmtDay(f.departureAt)}</td><td>${esc(AIRLINE[f.airline] || f.airline)} <span class="muted">${esc(f.airline)} ${esc(f.flightNumber)}</span></td><td>${f.transfers ? `${f.transfers} stop` : "Non-stop"}</td><td class="num"><strong>${inr(f.price)}</strong></td>
<td class="act">${f.url ? `<a class="btn sm" href="${esc(f.url)}" rel="sponsored nofollow noopener" target="_blank">Book</a>` : `<span class="muted">Sample</span>`}</td></tr>`).join("");
  page(r.urlPath, {
    title: `Cheapest ${name} Flights from ${inr(r.s.cur)}`, active: "/flights/", noindex: r.demo, pageClass: "product-page",
    description: `Cheapest ${name} flight tickets right now start at ${inr(r.s.cur)}. Compare the lowest fares for the next 2 months and see how the price has moved.`,
    body: `${crumbHtml(trail)}<div class="page-head"><h1>${esc(city(r.origin))} to ${esc(city(r.destination))}</h1>
<p class="p-price"><strong>${inr(r.s.cur)}</strong><span>cheapest one-way fare</span></p>
${r.cheap ? `<p class="flag drop">Cheaper than this week's average of ${inr(r.wkAvg)}</p>` : ""}
<p class="lede">Over the last 30 days the cheapest fare on this route ranged from ${inr(r.s.low)} to ${inr(r.s.high)}. Fares are cached, so the airline's price at booking can differ.</p></div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Flight</th><th>Stops</th><th class="num">Fare</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<section class="chart-card" data-chart data-label="${esc(name)} cheapest fare"><div class="chart-head"><h2>Cheapest fare over time</h2>
<div class="seg" role="group" aria-label="Time range"><button type="button" data-range="7" aria-pressed="false">7 days</button><button type="button" data-range="30" aria-pressed="true">30 days</button></div></div>
<div class="chart-box" data-chart-box></div><script type="application/json" data-chart-data>${json(r.history.map((h) => [Math.round(Date.parse(h.t) / 60e3), h.p]))}</script></section>`,
    jsonLd: [crumbs(trail)],
  });
}

// Watchlist (rendered in the browser from catalog.json)
page("/watchlist/", {
  title: "Your Watchlist", active: "/watchlist/", noindex: true,
  description: "Products you're watching and how their prices changed since you started watching.",
  body: `${crumbHtml([["Home", "/"], ["Watchlist", "/watchlist/"]])}<div class="page-head"><h1>Your watchlist</h1><p class="lede">Tap the heart on any product to watch it. We'll show here how much its price changed since you started watching. Your list is saved on this device only.</p></div>
<div data-watchlist><p class="empty">You're not watching anything yet. <a href="${rel("/deals/")}">Browse today's price drops</a> and tap the heart on anything you want to buy later.</p></div>`,
});

// Guides
for (const f of fs.readdirSync(path.join(ROOT, "guides"))) {
  const src = fs.readFileSync(path.join(ROOT, "guides", f), "utf8");
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  const up = `/${f.replace(/\.html$/, "")}/`;
  const trail = [["Home", "/"], [meta.title, up]];
  page(up, {
    title: meta.title, description: meta.description, active: up,
    body: `${crumbHtml(trail)}<article class="guide">${m[2]}<p class="muted">Last updated ${fmtDate(meta.updated)}</p></article>`,
    jsonLd: [crumbs(trail), { "@type": "Article", headline: meta.title, description: meta.description, dateModified: meta.updated, author: { "@type": "Organization", name: site.author } }],
  });
}

// 404
write("/404.html", layout({ title: "Page not found", description: "Page not found", urlPath: "/404.html", noindex: true,
  body: `<div class="page-head"><h1>This page isn't here</h1><p class="lede">The product may have stopped being tracked. <a href="${rel("/deals/")}">See today's price drops</a> or press <kbd>/</kbd> to search.</p></div>` }));

// Data for search, watchlist and live updates
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.writeFileSync(path.join(OUT, "data", "catalog.json"), JSON.stringify({
  updatedAt: new Date(NOW).toISOString(),
  products: products.map((p) => ({ id: p.id, t: p.title, u: p.urlPath, c: catBySlug[p.category]?.name || "", p: p.s.cur, d: +p.s.dropPct.toFixed(1), i: p.image || null })),
  routes: routes.map((r) => ({ t: `${city(r.origin)} to ${city(r.destination)}`, u: r.urlPath, p: r.s.cur })),
  categories: track.categories.map((c) => ({ t: c.name, u: `/category/${c.slug}/` })),
}));
fs.writeFileSync(path.join(OUT, "data", "meta.json"), JSON.stringify({ updatedAt: new Date(NOW).toISOString(), nextCheck }));
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: site.name, short_name: "DealDrop", start_url: rel("/"), display: "standalone", background_color: "#EEF1F5", theme_color: "#13233B",
  icons: [{ src: rel("/favicon.svg"), sizes: "any", type: "image/svg+xml" }],
}));

// sitemap + robots
const today = new Date(NOW).toISOString().slice(0, 10);
write("/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${(allDemo ? [] : sitemap).map((u) => `  <url><loc>${abs(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
write("/robots.txt", `User-agent: *\nAllow: /\nDisallow: /watchlist/\n\nSitemap: ${abs("/sitemap.xml")}\n`);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log(`Built ${sitemap.length} indexable pages (${products.length} products, ${drops.length} drops, ${routes.length} routes) for ${siteUrl}${allDemo ? " [DEMO: noindex]" : ""}`);
