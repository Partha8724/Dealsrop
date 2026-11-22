// Cheapest flight fares via the Travelpayouts (Aviasales) Data API.
// Needs env TP_TOKEN (API token) and TP_MARKER (your partner marker, for commission).
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

function enabled() {
  return Boolean(process.env.TP_TOKEN);
}

function monthsAhead(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

function normalize(t, origin, destination) {
  if (!t || !t.price) return null;
  const marker = process.env.TP_MARKER ? `&marker=${encodeURIComponent(process.env.TP_MARKER)}` : "";
  return {
    price: Number(t.price),
    airline: t.airline || "",
    flightNumber: t.flight_number ? String(t.flight_number) : "",
    departureAt: t.departure_at,
    transfers: t.transfers ?? 0,
    url: t.link ? `https://www.aviasales.com${t.link}${marker}` : null,
    origin,
    destination,
  };
}

// Returns the cheapest fares for a route over the next 2 months.
async function cheapest(origin, destination) {
  const all = [];
  for (const month of monthsAhead(2)) {
    const qs = new URLSearchParams({
      origin, destination, departure_at: month, currency: "inr", sorting: "price",
      limit: "10", one_way: "true", direct: "false", token: process.env.TP_TOKEN,
    });
    const res = await fetch(`${API}?${qs}`);
    if (!res.ok) throw new Error(`Travelpayouts ${res.status} for ${origin}-${destination}`);
    const json = await res.json();
    for (const t of json.data || []) {
      const n = normalize(t, origin, destination);
      if (n) all.push(n);
    }
  }
  return all.sort((a, b) => a.price - b.price).slice(0, 8);
}

module.exports = { name: "flights", enabled, cheapest, normalize };
