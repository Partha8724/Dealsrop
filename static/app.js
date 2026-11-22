/* DealDrop India — interactive layer. The site works without this; it adds the live board,
   search, filters, charts, watchlist and live-update notices. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const body = document.body;
  const BASE = body.dataset.base || "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- toast ---------- */
  const toastEl = $("[data-toast]");
  let toastTimer;
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = "";
    toastEl.append(Object.assign(document.createElement("span"), { textContent: msg }));
    if (action) {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: action.label });
      b.onclick = action.run;
      toastEl.append(b);
    }
    toastEl.hidden = false;
    if (!action) toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
  }

  /* ---------- theme ---------- */
  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    localStorage.setItem("dd-theme", root.dataset.theme);
  });

  /* ---------- live time + countdown + update check ---------- */
  const updatedAt = Date.parse(body.dataset.updated);
  let nextAt = Date.parse(body.dataset.next);
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h} hr ${m % 60} min ago` : new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }
  function tick() {
    $$("[data-rel]").forEach((el) => (el.textContent = ago(Date.parse(el.getAttribute("datetime")))));
    const left = nextAt - Date.now();
    $$("[data-countdown]").forEach((el) => {
      if (left <= 0) { el.textContent = "a few minutes"; return; }
      const m = Math.floor(left / 60e3), s = Math.floor((left % 60e3) / 1e3);
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    });
  }
  tick();
  setInterval(tick, 1000);

  let notified = false;
  async function checkForUpdate() {
    if (notified || document.hidden) return;
    try {
      const r = await fetch(`${BASE}/data/meta.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const m = await r.json();
      nextAt = Date.parse(m.nextCheck) || nextAt;
      if (Date.parse(m.updatedAt) > updatedAt) {
        notified = true;
        toast("New prices just came in.", { label: "Show new prices", run: () => location.reload() });
      }
    } catch {}
  }
  setInterval(checkForUpdate, 120e3);
  document.addEventListener("visibilitychange", () => !document.hidden && checkForUpdate());

  /* ---------- split-flap board ---------- */
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%";
  const narrow = () => matchMedia("(max-width: 640px)").matches;
  function widthFor(el) {
    const w = +el.dataset.w;
    if (!narrow()) return w;
    return el.closest(".c-item") ? Math.min(w, 10) : w;
  }
  function fit(text, w) {
    text = String(text);
    if (text.length > w) text = text.slice(0, w - 1).trimEnd() + "…";
    return text.padEnd(w, " ").slice(0, w);
  }
  function setFlaps(el, text, delay = 0, animate = !reduced) {
    const w = widthFor(el);
    const target = fit(text, w);
    el.setAttribute("aria-label", String(text).trim());
    let cells = $$(".f", el);
    if (cells.length !== w) {
      el.textContent = "";
      cells = Array.from({ length: w }, () => {
        const c = document.createElement("span");
        c.className = "f";
        c.setAttribute("aria-hidden", "true");
        el.append(c);
        return c;
      });
    }
    cells.forEach((c, i) => {
      const ch = target[i];
      if (c.textContent === ch && c.dataset.set) return;
      c.dataset.set = 1;
      if (!animate || ch === " " && !c.textContent.trim()) { c.textContent = ch; return; }
      const steps = 2 + Math.floor(Math.random() * 3);
      let n = 0;
      setTimeout(function step() {
        c.classList.remove("flip"); void c.offsetWidth; c.classList.add("flip");
        c.textContent = n < steps ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : ch;
        if (n++ < steps) setTimeout(step, 70);
      }, delay + i * 16);
    });
  }
  $$("[data-board]").forEach((board) => {
    const flaps = $$(".flaps", board);
    flaps.forEach((el, k) => setFlaps(el, el.dataset.flap, Math.floor(k / 4) * 120));
    // Rows that fall in price get green numbers; rises get red.
    $$(".c-fall .flaps", board).forEach((el) => el.dataset.flap.startsWith("↑") && (el.dataset.up = ""));
  });
  addEventListener("resize", debounce(() => $$("[data-board] .flaps").forEach((el) => setFlaps(el, el.getAttribute("aria-label") || el.dataset.flap, 0, false)), 200));

  // Home board cycles through all of today's drops.
  const rowsData = $("[data-board-rows]");
  const homeBoard = $(".hero [data-board]");
  if (rowsData && homeBoard) {
    const all = JSON.parse(rowsData.textContent);
    const trs = $$("tbody tr", homeBoard);
    let page = 0, paused = false;
    const pages = Math.ceil(all.length / trs.length);
    ["mouseenter", "focusin"].forEach((e) => homeBoard.addEventListener(e, () => (paused = true)));
    ["mouseleave", "focusout"].forEach((e) => homeBoard.addEventListener(e, () => (paused = false)));
    if (pages > 1 && !reduced) setInterval(() => {
      if (paused || document.hidden) return;
      page = (page + 1) % pages;
      trs.forEach((tr, r) => {
        const row = all[page * trs.length + r] || all[r];
        $$(".flaps", tr).forEach((el, c) => setFlaps(el, row.v[c], r * 110));
        const a = $("a", tr);
        if (a) a.href = row.h;
      });
    }, 7000);
  }

  // Count-up for the total saved number.
  $$("[data-count]").forEach((el) => {
    const end = +el.dataset.count;
    if (reduced || !end) return;
    const t0 = performance.now(), dur = 1400;
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = inr(end * e);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  });

  /* ---------- catalog (search + watchlist) ---------- */
  let catalogP;
  const catalog = () => (catalogP ??= fetch(`${BASE}/data/catalog.json`).then((r) => r.json()));

  /* ---------- search ---------- */
  const sEl = $("[data-search]"), sIn = $("[data-search-input]"), sRes = $("[data-search-results]");
  let sel = 0, results = [];
  function openSearch() {
    sEl.hidden = false;
    sIn.value = "";
    sIn.focus();
    catalog().then(() => render(""));
  }
  function closeSearch() { sEl.hidden = true; }
  function score(text, q) {
    text = text.toLowerCase();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => text.includes(w))) return -1;
    return words.reduce((s, w) => s + (text.startsWith(w) ? 3 : text.includes(" " + w) ? 2 : 1), 0);
  }
  async function render(q) {
    const c = await catalog();
    const items = [
      ...c.categories.map((x) => ({ ...x, kind: "Category" })),
      ...c.routes.map((x) => ({ ...x, kind: "Flight", price: x.p })),
      ...c.products.map((x) => ({ ...x, kind: x.c, price: x.p, drop: x.d })),
    ];
    results = q.trim()
      ? items.map((x) => ({ x, s: score(`${x.t} ${x.kind}`, q) })).filter((r) => r.s >= 0).sort((a, b) => b.s - a.s).slice(0, 12).map((r) => r.x)
      : c.products.filter((p) => p.d > 0).slice(0, 6).map((x) => ({ ...x, kind: `${x.c}, ${x.d}% lower than yesterday`, price: x.p, drop: x.d }));
    sel = 0;
    sRes.innerHTML = results.length
      ? results.map((r, i) => `<li role="option" aria-selected="${i === sel}"><a href="${BASE}${r.u}" class="${r.drop > 0 ? "drop" : ""}"><span>${escapeHtml(r.t)}<small>${escapeHtml(r.kind)}</small></span>${r.price ? `<b>${r.kind === "Flight" ? "from " : ""}${inr(r.price)}</b>` : ""}</a></li>`).join("")
      : `<li class="none">Nothing matches "${escapeHtml(q)}". Try a product type like "earbuds" or a city like "Goa".</li>`;
  }
  function move(d) {
    const lis = $$("li[role=option]", sRes);
    if (!lis.length) return;
    sel = (sel + d + lis.length) % lis.length;
    lis.forEach((li, i) => li.setAttribute("aria-selected", i === sel));
    lis[sel].scrollIntoView({ block: "nearest" });
  }
  $$("[data-open-search]").forEach((b) => b.addEventListener("click", openSearch));
  sIn?.addEventListener("input", () => render(sIn.value));
  sEl?.addEventListener("click", (e) => e.target === sEl && closeSearch());
  addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openSearch(); }
    if (sEl.hidden) return;
    if (e.key === "Escape") closeSearch();
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    if (e.key === "Enter" && results[sel]) { e.preventDefault(); location.href = BASE + results[sel].u; }
  });

  /* ---------- watchlist ---------- */
  const watched = () => store.get("dd-watch", {});
  function syncWatch() {
    const w = watched();
    $$("[data-watch]").forEach((b) => {
      const on = Boolean(w[b.dataset.watch]);
      b.setAttribute("aria-pressed", on);
      const lbl = $("[data-watch-label]", b);
      if (lbl) lbl.textContent = on ? "Watching" : "Watch price";
    });
    const n = Object.keys(w).length;
    $$("[data-watch-count]").forEach((el) => { el.hidden = !n; el.textContent = n; });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-watch]");
    if (!b) return;
    e.preventDefault();
    const w = watched(), id = b.dataset.watch;
    if (w[id]) { delete w[id]; toast("Removed from your watchlist."); }
    else {
      w[id] = { p: +b.dataset.watchPrice, at: Date.now() };
      toast("Watching this price. Find it in your watchlist.");
      b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    }
    store.set("dd-watch", w);
    syncWatch();
    if ($("[data-watchlist]")) renderWatchlist();
  });
  syncWatch();
  addEventListener("storage", syncWatch);

  async function renderWatchlist() {
    const box = $("[data-watchlist]");
    const w = watched();
    const ids = Object.keys(w);
    if (!ids.length) return;
    const c = await catalog();
    const byId = Object.fromEntries(c.products.map((p) => [p.id, p]));
    const rows = ids.map((id) => ({ id, ...w[id], cur: byId[id] })).sort((a, b) => b.at - a.at);
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="num">When added</th><th class="num">Now</th><th class="num">Change</th><th></th></tr></thead><tbody>${rows.map((r) => {
      if (!r.cur) return `<tr><td colspan="4" class="muted">A product you watched is no longer tracked.</td><td class="act"><button class="btn sm ghost" data-watch="${escapeHtml(r.id)}" aria-pressed="true">Remove</button></td></tr>`;
      const d = r.cur.p - r.p;
      const cls = d < 0 ? "drop" : d > 0 ? "rise" : "";
      return `<tr><td><a href="${BASE}${r.cur.u}">${escapeHtml(r.cur.t)}</a></td><td class="num">${inr(r.p)}</td><td class="num"><strong>${inr(r.cur.p)}</strong></td>
<td class="num">${d ? `<span class="flag ${cls}">${d < 0 ? "−" : "+"}${inr(Math.abs(d))}</span>` : `<span class="muted">No change</span>`}</td>
<td class="act"><button class="btn sm ghost" data-watch="${escapeHtml(r.id)}" aria-pressed="true">Remove</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }
  if ($("[data-watchlist]")) renderWatchlist();

  /* ---------- filters (deals page) ---------- */
  const F = $("[data-filters]");
  if (F) {
    const gridEl = $("[data-grid]");
    const cards = $$("[data-card]", gridEl);
    const prices = cards.map((c) => +c.dataset.price);
    const maxP = Math.max(...prices), minP = Math.min(...prices);
    const range = $("[data-f-max]"), out = $("[data-f-maxout]");
    const state = { cat: "", drops: true, low: false, sort: "drop", max: 100 };
    const priceAt = (v) => Math.ceil((minP + (maxP - minP) * (v / 100)) / 100) * 100;
    function apply() {
      const lim = state.max >= 100 ? Infinity : priceAt(state.max);
      out.textContent = lim === Infinity ? "any price" : inr(lim);
      const key = { drop: (c) => -c.dataset.drop, saved: (c) => -c.dataset.saved, low: (c) => +c.dataset.price, high: (c) => -c.dataset.price }[state.sort];
      const sorted = [...cards].sort((a, b) => key(a) - key(b));
      let n = 0;
      const doIt = () => {
        sorted.forEach((c) => {
          const show = (!state.cat || c.dataset.cat === state.cat) && (!state.drops || +c.dataset.drop >= +(body.dataset.minDrop || 3)) && (!state.low || c.dataset.low === "1") && +c.dataset.price <= lim;
          c.hidden = !show;
          if (show) n++;
          gridEl.append(c);
        });
        $("[data-f-count]").textContent = n ? `Showing ${n} of ${cards.length} products` : "";
        let empty = $(".empty", F.parentElement);
        if (!n) {
          if (!empty) { empty = document.createElement("p"); empty.className = "empty"; gridEl.before(empty); }
          empty.textContent = "No products match these filters. Turn off “Cheaper than yesterday” or raise the price limit to see more.";
        } else empty?.remove();
      };
      if (document.startViewTransition && !reduced) document.startViewTransition(doIt); else doIt();
    }
    F.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-f-cat]");
      if (!chip) return;
      $$("[data-f-cat]", F).forEach((c) => c.setAttribute("aria-pressed", c === chip));
      state.cat = chip.dataset.fCat;
      apply();
    });
    $("[data-f-drops]").addEventListener("change", (e) => { state.drops = e.target.checked; apply(); });
    $("[data-f-low]").addEventListener("change", (e) => { state.low = e.target.checked; apply(); });
    $("[data-f-sort]").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    range.addEventListener("input", debounce(() => { state.max = +range.value; apply(); }, 120));
    const startCat = new URLSearchParams(location.search).get("cat");
    if (startCat) $(`[data-f-cat="${CSS.escape(startCat)}"]`, F)?.click();
    else apply();
  }

  /* ---------- price chart ---------- */
  $$("[data-chart]").forEach((card) => {
    const raw = JSON.parse($("[data-chart-data]", card).textContent).map(([m, p]) => ({ t: m * 60e3, p }));
    const box = $("[data-chart-box]", card);
    let days = 30, pts = [], first = true;
    box.tabIndex = 0;
    box.setAttribute("role", "img");
    const tip = Object.assign(document.createElement("div"), { className: "tip", hidden: true });
    function draw() {
      const end = raw[raw.length - 1].t;
      pts = raw.filter((d) => d.t >= end - days * 864e5);
      if (pts.length < 2) pts = raw.slice(-2);
      const W = box.clientWidth, H = box.clientHeight, L = 56, R = 12, T = 16, B = 28;
      const ps = pts.map((d) => d.p);
      let lo = Math.min(...ps), hi = Math.max(...ps);
      const pad = (hi - lo || hi * 0.05) * 0.15; lo -= pad; hi += pad;
      const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
      const y = (p) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
      const line = pts.map((d) => `${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join(" ");
      const minPt = pts.reduce((a, b) => (b.p < a.p ? b : a));
      const grid = [0, 1, 2, 3].map((i) => { const v = lo + ((hi - lo) * i) / 3; return `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${inr(v)}</text>`; }).join("");
      const xt = [0, 1, 2, 3].map((i) => { const t = t0 + ((t1 - t0) * i) / 3; return `<text class="ax" x="${x(t)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === 3 ? "end" : "middle"}">${new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>`; }).join("");
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${grid}${xt}
<polygon class="area" points="${x(t0)},${H - B} ${line} ${x(t1)},${H - B}"/>
<polyline class="ln${first || !reduced ? " draw" : ""}" points="${line}"/>
<circle class="lowpt" cx="${x(minPt.t)}" cy="${y(minPt.p)}" r="4"/>
<line class="cross" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="hov" r="5" visibility="hidden"/></svg>`;
      box.append(tip);
      const pl = $(".ln", box);
      if (!reduced) pl.style.setProperty("--len", Math.ceil(pl.getTotalLength()));
      else pl.classList.remove("draw");
      box.setAttribute("aria-label", `${card.dataset.label}: ${pts.length} price checks over ${days} days, lowest ${inr(minPt.p)}, now ${inr(pts[pts.length - 1].p)}`);
      first = false;
      box._x = x; box._y = y;
    }
    let hi = -1;
    function show(i) {
      hi = Math.max(0, Math.min(pts.length - 1, i));
      const d = pts[hi], cx = box._x(d.t), cy = box._y(d.p);
      const cross = $(".cross", box), hov = $(".hov", box);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      hov.setAttribute("cx", cx); hov.setAttribute("cy", cy); hov.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = `<b>${inr(d.p)}</b> ${new Date(d.t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
      const tw = tip.offsetWidth / 2;
      tip.style.left = Math.max(tw, Math.min(box.clientWidth - tw, cx)) + "px";
      tip.style.top = cy + "px";
    }
    function hide() { tip.hidden = true; $$(".cross,.hov", box).forEach((e) => e.setAttribute("visibility", "hidden")); hi = -1; }
    box.addEventListener("pointermove", (e) => {
      const r = box.getBoundingClientRect(), mx = e.clientX - r.left;
      let best = 0, bd = Infinity;
      pts.forEach((d, i) => { const dd = Math.abs(box._x(d.t) - mx); if (dd < bd) { bd = dd; best = i; } });
      show(best);
    });
    box.addEventListener("pointerleave", hide);
    box.addEventListener("blur", hide);
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show((hi < 0 ? pts.length - 1 : hi) + (e.key === "ArrowLeft" ? -1 : 1)); }
    });
    $$("[data-range]", card).forEach((b) => b.addEventListener("click", () => {
      $$("[data-range]", card).forEach((x) => x.setAttribute("aria-pressed", x === b));
      days = +b.dataset.range; hide(); draw();
    }));
    draw();
    addEventListener("resize", debounce(() => { first = false; draw(); }, 150));
  });

  /* ---------- share ---------- */
  $$("[data-share]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); b.textContent = "Link copied"; toast("Link copied."); setTimeout(() => (b.textContent = "Copy link"), 2400); }
    catch { toast("Couldn't copy. Copy the address from your browser bar instead."); }
  }));

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
})();
