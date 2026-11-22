// Demo provider: generates SAMPLE products and fares so the whole site works before
// API keys are added. Every demo item is flagged demo:true and the site shows a
// clear "sample data" banner, so these prices are never presented as real.

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const MODELS = ["A1", "Pro", "Lite", "Max", "S2", "Neo", "Air", "Plus", "X5", "Go"];
const BASE_PRICE = { earbuds: 1800, smartwatches: 2800, "mixer-grinders": 3200, backpacks: 1400, "power-banks": 1500, shoes: 2200 };

// Price for a product at a given moment: slow drift plus occasional sale dips.
function priceAt(id, base, t) {
  const slot = Math.floor(t / (6 * 3600e3)); // changes every 6 hours
  const r = rng(`${id}:${slot}`);
  const wave = Math.sin(slot / 9 + base) * 0.08;
  const sale = r() < 0.18 ? -(0.08 + r() * 0.22) : 0;
  return Math.max(199, Math.round((base * (1 + wave + sale)) / 10) * 10 - 1);
}

function products(category, count, t = Date.now()) {
  const base = BASE_PRICE[category.slug] || 1500;
  const single = category.name.replace(/(ch|sh|x)es$/, "$1").replace(/s$/, "");
  return Array.from({ length: count }, (_, i) => {
    const id = `demo-${category.slug}-${i + 1}`;
    const r = rng(id);
    const myBase = Math.round(base * (0.6 + r() * 1.1));
    return {
      id,
      source: "Demo store",
      title: `Sample ${single} ${MODELS[i % MODELS.length]} (demo item)`,
      url: null,
      image: null,
      brand: "Sample Brand",
      category: category.slug,
      price: priceAt(id, myBase, t),
      mrp: Math.round(myBase * 1.6 / 100) * 100 - 1,
      inStock: true,
      demo: true,
    };
  });
}

const AIRLINES = ["6E", "AI", "QP", "SG", "IX"];
function fares(origin, destination, t = Date.now()) {
  const r = rng(`${origin}${destination}:${Math.floor(t / (6 * 3600e3))}`);
  const base = 3000 + Math.round(rng(origin + destination)() * 4000);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(t + (3 + Math.floor(r() * 50)) * 86400e3);
    return {
      price: Math.round((base * (0.75 + r() * 0.6)) / 10) * 10 + i * 37,
      airline: AIRLINES[Math.floor(r() * AIRLINES.length)],
      flightNumber: String(100 + Math.floor(r() * 800)),
      departureAt: d.toISOString().slice(0, 10) + "T0" + (5 + (i % 5)) + ":30:00+05:30",
      transfers: r() < 0.7 ? 0 : 1,
      url: null,
      origin,
      destination,
      demo: true,
    };
  }).sort((a, b) => a.price - b.price);
}

module.exports = { name: "demo", products, fares };
