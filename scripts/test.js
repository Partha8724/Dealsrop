#!/usr/bin/env node
// End-to-end test of LIVE mode using mocked Flipkart + Travelpayouts API responses.
// Runs in a temp copy so your real data is untouched. Run: npm test
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dealdrop-test-"));
for (const d of ["config", "scripts", "static", "guides"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });

// Mock fetch: returns API-shaped responses. Price changes between runs via MOCK_RUN.
fs.writeFileSync(path.join(tmp, "mock.js"), `
const run = Number(process.env.MOCK_RUN || 0);
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes("affiliate-api.flipkart.net")) {
    if (opts.headers["Fk-Affiliate-Token"] !== "tok") return { ok: false, status: 401 };
    const q = new URL(url).searchParams.get("query");
    const products = [1, 2, 3].map((i) => ({ productBaseInfoV1: {
      productId: "ID" + q.replace(/\\W/g, "").slice(0, 6).toUpperCase() + i,
      title: "Real " + q + " " + i, productUrl: "https://dl.flipkart.com/dl/p/x?affid=me",
      imageUrls: { "200x200": "https://img.example/x.jpg" }, productBrand: "BrandCo",
      maximumRetailPrice: { amount: 3999 }, flipkartSpecialPrice: { amount: (run ? 1999 : 2499) - i * 10 }, inStock: true } }));
    return { ok: true, json: async () => ({ products }) };
  }
  if (url.includes("api.travelpayouts.com")) {
    const u = new URL(url);
    return { ok: true, json: async () => ({ success: true, data: [
      { price: 4123 - run * 300, airline: "6E", flight_number: 512, departure_at: "2026-12-14T06:10:00+05:30", transfers: 0, link: "/search/DEL1412BOM1" },
      { price: 4980, airline: "AI", flight_number: 887, departure_at: "2026-12-20T09:00:00+05:30", transfers: 1, link: "/search/DEL2012BOM1" } ] }) };
  }
  throw new Error("unexpected url " + url);
};`);

const env = { ...process.env, FK_AFFILIATE_ID: "me", FK_AFFILIATE_TOKEN: "tok", TP_TOKEN: "t", TP_MARKER: "123", SITE_URL: "https://u.github.io/dealdrop" };
const node = (script, extra = {}) => execFileSync("node", ["-r", path.join(tmp, "mock.js"), path.join(tmp, script)], { env: { ...env, ...extra }, encoding: "utf8" });

console.log(node("scripts/fetch.js", { MOCK_RUN: "0" }).trim());
// pretend first fetch was yesterday so today's run counts as a 24h drop
const dataFile = path.join(tmp, "data", "prices.json");
const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
for (const rec of [...Object.values(db.products), ...Object.values(db.flights)]) rec.history.forEach((h) => (h.t = new Date(Date.parse(h.t) - 86400e3).toISOString()));
fs.writeFileSync(dataFile, JSON.stringify(db));
console.log(node("scripts/fetch.js", { MOCK_RUN: "1" }).trim());
console.log(node("scripts/build.js").trim());

const dist = path.join(tmp, "dist");
const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
assert(!home.includes("demo-banner"), "demo banner should be gone in live mode");
assert(home.includes("Real "), "real products shown");
assert(fs.readFileSync(path.join(dist, "deals", "index.html"), "utf8").includes("Real wireless earbuds 1"), "all drops listed");
assert(home.includes('content="index, follow'), "live pages are indexable");
assert(/\d+% lower than yesterday/.test(home), "price drop badge shown");
assert(fs.existsSync(path.join(dist, "data", "catalog.json")) && fs.existsSync(path.join(dist, "app.js")), "live data + script built");
const prodDir = fs.readdirSync(path.join(dist, "product"))[0];
const prod = fs.readFileSync(path.join(dist, "product", prodDir, "index.html"), "utf8");
assert(prod.includes('"@type":"Product"') && prod.includes('"priceCurrency":"INR"'), "Product schema present");
assert(prod.includes('rel="sponsored nofollow noopener"'), "affiliate link marked sponsored");
const route = fs.readFileSync(path.join(dist, "flights", "delhi-to-mumbai", "index.html"), "utf8");
assert(route.includes("marker=123") && route.includes("IndiGo"), "flight booking link carries marker");
const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
assert((sitemap.match(/<loc>/g) || []).length > 20, "sitemap filled");
assert(sitemap.includes("https://u.github.io/dealdrop/product/"), "sitemap uses absolute URLs");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("All live-mode tests passed ✔");
