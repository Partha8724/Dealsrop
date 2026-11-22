#!/usr/bin/env node
// Fetches current prices and appends them to data/prices.json (the price history database).
// Uses real APIs when keys are set, otherwise demo data. Run: node scripts/fetch.js
const fs = require("fs");
const path = require("path");
const flipkart = require("./providers/flipkart");
const flights = require("./providers/flights");
const demo = require("./providers/demo");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "prices.json");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "site.json"), "utf8"));
const track = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "track.json"), "utf8"));

const DAY = 86400e3;
const now = Date.now();

function load() {
  if (!fs.existsSync(DATA)) return { products: {}, flights: {} };
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

// Add a price point; if the last point is under 1 hour old, replace it instead.
function addPoint(history, price, t) {
  const last = history[history.length - 1];
  if (last && t - Date.parse(last.t) < 3600e3) history.pop();
  history.push({ t: new Date(t).toISOString(), p: price });
  const cutoff = t - site.historyDays * DAY;
  while (history.length && Date.parse(history[0].t) < cutoff) history.shift();
}

// In demo mode with no history yet, backfill 30 days so charts and drops work immediately.
function backfillDemo(db, doProducts, doFlights) {
  if (doProducts) for (const cat of track.categories) {
    for (let t = now - 30 * DAY; t < now - 3600e3; t += 6 * 3600e3) {
      for (const p of demo.products(cat, track.productsPerQuery, t)) {
        db.products[p.id] ??= { ...p, history: [], firstSeen: new Date(t).toISOString() };
        addPoint(db.products[p.id].history, p.price, t);
      }
    }
  }
  if (doFlights) for (const [o, d] of track.flightRoutes) {
    for (let t = now - 30 * DAY; t < now - 3600e3; t += 6 * 3600e3) {
      const key = `${o}-${d}`;
      db.flights[key] ??= { origin: o, destination: d, history: [], fares: [] };
      addPoint(db.flights[key].history, demo.fares(o, d, t)[0].price, t);
    }
  }
}

async function main() {
  const db = load();
  const live = { products: flipkart.enabled(), flights: flights.enabled() };
  const errors = [];

  // When switching from demo to real data, drop the demo items.
  if (live.products) for (const id of Object.keys(db.products)) if (db.products[id].demo) delete db.products[id];
  if (live.flights) for (const k of Object.keys(db.flights)) if (db.flights[k].demo) delete db.flights[k];
  backfillDemo(db, !live.products && !Object.keys(db.products).length, !live.flights && !Object.keys(db.flights).length);

  // ---- products
  for (const cat of track.categories) {
    for (const q of cat.queries) {
      let items = [];
      try {
        items = live.products
          ? await flipkart.search(q, track.productsPerQuery, cat.slug)
          : demo.products(cat, track.productsPerQuery, now);
      } catch (e) {
        errors.push(e.message);
        continue;
      }
      for (const it of items) {
        const rec = (db.products[it.id] ??= { history: [], firstSeen: new Date(now).toISOString() });
        Object.assign(rec, it, { lastSeen: new Date(now).toISOString() });
        addPoint(rec.history, it.price, now);
      }
    }
  }
  // forget products not seen for 14 days
  for (const [id, p] of Object.entries(db.products)) {
    if (p.lastSeen && now - Date.parse(p.lastSeen) > 14 * DAY) delete db.products[id];
  }

  // ---- flights
  for (const [o, d] of track.flightRoutes) {
    const key = `${o}-${d}`;
    let fares = [];
    try {
      fares = live.flights ? await flights.cheapest(o, d) : demo.fares(o, d, now);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    if (!fares.length) continue;
    const rec = (db.flights[key] ??= { origin: o, destination: d, history: [] });
    rec.fares = fares;
    rec.demo = !live.flights;
    addPoint(rec.history, fares[0].price, now);
  }

  db.updatedAt = new Date(now).toISOString();
  db.mode = { products: live.products ? "live" : "demo", flights: live.flights ? "live" : "demo" };
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(db));

  console.log(`Products: ${Object.keys(db.products).length} (${db.mode.products}), routes: ${Object.keys(db.flights).length} (${db.mode.flights})`);
  if (errors.length) {
    console.warn("Some requests failed:\n  " + errors.join("\n  "));
    if (errors.length > 0 && !Object.keys(db.products).length) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
