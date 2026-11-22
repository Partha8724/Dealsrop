# DealDrop India – automatic price-drop tracker

A website that checks product prices and flight fares every hour, saves the full price history, and shows **which items got cheaper today**. It runs completely free on GitHub (Actions + Pages). There's no server to manage.

## What it does

| Part | What happens |
|---|---|
| `scripts/fetch.js` | Gets current prices (Flipkart Affiliate API, Travelpayouts flight API) and adds them to `data/prices.json` |
| `scripts/build.js` | Builds the website: today's drops, 30-day lows, category pages, product pages with price charts, cheapest flights per route, train ticket guide |
| `.github/workflows/update.yml` | Runs fetch → saves history → builds → deploys **every hour automatically** |
| `static/app.js` | Live features: split-flap price board, countdown to next check, "new prices" alert, instant search (`/`), filters, interactive charts, watchlist, dark mode |
| SEO | Titles, descriptions, canonical URLs, Product/Offer + Breadcrumb + ItemList schema, sitemap.xml, robots.txt, fast static pages, mobile-friendly |

**Demo mode:** until you add API keys, the site runs on clearly labelled **sample data**. A yellow banner shows on every page, and pages are set to `noindex` so Google never indexes fake prices. As soon as keys are added, real prices replace the demo data automatically.

## Setup (one time, ~15 minutes)

### 1. Put it on GitHub
1. Create a new **public** repository named `dealdrop` on GitHub.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/Partha8724/Dealsrop.git
   git push -u origin main
   ```
3. Open the repo → **Settings → Pages → Source: GitHub Actions**.
4. Go to **Actions → Update prices and deploy → Run workflow**. Your site goes live at `https://partha8724.github.io/Dealsrop/`.

### 2. Turn on real prices (free sign-ups)
| Service | Sign up | Secret names to add |
|---|---|---|
| Flipkart Affiliate (products) | affiliate.flipkart.com → after approval: **API → API Token** | `FK_AFFILIATE_ID`, `FK_AFFILIATE_TOKEN` |
| Travelpayouts (flights) | travelpayouts.com → join the Aviasales program → **Profile → API token** and your **marker** | `TP_TOKEN`, `TP_MARKER` |

Add them in the repo under **Settings → Secrets and variables → Actions → New repository secret**. Then run the workflow again. Keys stay private there. Never put them in code.

### 3. Get on Google
1. Edit `config/site.json` (site name, description, url).
2. Open [Google Search Console](https://search.google.com/search-console) → add a URL-prefix property for your site URL.
3. Choose **HTML tag** verification, paste the `content` value into `googleSiteVerification` in `config/site.json`, and push.
4. Click **Verify**, then **Sitemaps → submit `sitemap.xml`**.

## Customise
- **What to track:** `config/track.json`. Add categories with search words, or flight routes using airport codes (`["DEL","BOM"]`).
- **Drop threshold:** `minDropPercent` in `config/site.json` (default 3%).
- **Guides / pages:** add an `.html` file in `guides/` with a title/description header. It becomes a page automatically. Guides bring a lot of Google traffic.

## Run on your computer
```bash
npm start     # fetch prices, build, preview at http://localhost:3000
npm test      # end-to-end test of real-API mode using mocked responses
```
Needs Node.js 20+. No other installs.

## Rules to stay safe
- Prices come only from **official affiliate APIs**. The site never scrapes store pages.
- Affiliate links are marked `rel="sponsored"` and there's a disclosure page. Keep both.
- Amazon can be added later through the Amazon **Creators API**. It needs an approved Associates account with recent sales first.
