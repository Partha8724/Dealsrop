// Flipkart Affiliate API provider (official).
// Needs env FK_AFFILIATE_ID and FK_AFFILIATE_TOKEN (Flipkart Affiliate → API → API Token).
const BASE = "https://affiliate-api.flipkart.net/affiliate/1.0";

function enabled() {
  return Boolean(process.env.FK_AFFILIATE_ID && process.env.FK_AFFILIATE_TOKEN);
}

function pickImage(imageUrls = {}) {
  return imageUrls["400x400"] || imageUrls["200x200"] || Object.values(imageUrls)[0] || null;
}

// Converts one Flipkart product into our standard shape.
function normalize(p, category) {
  const info = p.productBaseInfoV1 || p.productBaseInfo?.productAttributes || {};
  const price =
    info.flipkartSpecialPrice?.amount ?? info.flipkartSellingPrice?.amount ?? info.sellingPrice?.amount;
  const mrp = info.maximumRetailPrice?.amount ?? info.maximumRetailPrice;
  const id = info.productId || p.productBaseInfoV1?.productId;
  if (!id || !price) return null;
  return {
    id: `fk-${id}`,
    source: "Flipkart",
    title: info.title,
    url: info.productUrl, // already contains your affiliate id
    image: pickImage(info.imageUrls),
    brand: info.productBrand || null,
    category,
    price: Number(price),
    mrp: mrp ? Number(mrp) : null,
    inStock: info.inStock !== false,
  };
}

async function search(query, count, category) {
  const url = `${BASE}/search.json?query=${encodeURIComponent(query)}&resultCount=${count}`;
  const res = await fetch(url, {
    headers: {
      "Fk-Affiliate-Id": process.env.FK_AFFILIATE_ID,
      "Fk-Affiliate-Token": process.env.FK_AFFILIATE_TOKEN,
    },
  });
  if (!res.ok) throw new Error(`Flipkart ${res.status} for "${query}"`);
  const json = await res.json();
  return (json.products || []).map((p) => normalize(p, category)).filter(Boolean);
}

module.exports = { name: "flipkart", enabled, search, normalize };
