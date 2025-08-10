// scripts/merge-articles.js
// - Fusiona histórico + PY + JS sin perder fechas antiguas.
// - Deduplica por URL normalizada.
// - NO pisa campos con vacíos: si llega "" no borra title_es/content_es previos.
// - Orden final por fecha (published/date) descendente.

import fs from "fs";

const PY_PATH    = "workspace/astro/public/articles_py.json";
const JS_PATH    = "workspace/astro/public/articles_js.json";
const FINAL_PATH = "workspace/astro/public/articles.json";

const DATE_FIELDS = [
  "published", "pubDate", "datePublished", "publishedAt", "date", "updated", "isoDate"
];

function loadJSON(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : [];
}

function isNonEmpty(v) {
  return typeof v === "string" ? v.trim() !== "" : v != null;
}

function normUrl(u = "") {
  const s = String(u).trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    url.hash = "";
    url.search = "";
    return url.toString().toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function toISO(d) {
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}
function toDateShort(d) {
  const iso = toISO(d);
  return iso ? iso.slice(0, 10) : "";
}

function publishedOf(it) {
  for (const k of DATE_FIELDS) {
    if (isNonEmpty(it?.[k])) {
      const iso = toISO(it[k]);
      if (iso) return iso;
    }
  }
  return "";
}

function pickNewNoBlank(prev, inc) {
  // Usa el nuevo SOLO si viene no vacío; si no, conserva el previo
  return isNonEmpty(inc) ? inc : prev;
}

function mergeRecords(prev, inc) {
  // Clave común ya es la URL; empezamos del previo (histórico)
  const base = { ...prev, ...inc };

  // Fecha de publicación: PRIORIDAD histórico
  const prevPub = publishedOf(prev);
  const incPub  = publishedOf(inc);
  const published = prevPub || incPub || base.published || base.date || "";

  // Campos que no deben ser pisados por vacíos
  const title      = pickNewNoBlank(prev.title,      inc.title);
  const title_es   = pickNewNoBlank(prev.title_es,   inc.title_es);
  const content_es = pickNewNoBlank(prev.content_es, inc.content_es);
  const summary    = pickNewNoBlank(prev.summary,    inc.summary);
  const source     = pickNewNoBlank(prev.source,     inc.source);

  return {
    ...base,
    url: normUrl(base.url || prev.url || inc.url || ""),
    title,
    title_es: isNonEmpty(title_es) ? title_es : (title || prev.title || inc.title || ""),
    content_es: isNonEmpty(content_es) ? content_es : (summary || title || ""),
    summary,
    source,
    published,
    date: toDateShort(published) || base.date || "",
  };
}

function mergeAll(...lists) {
  const out = new Map();
  for (const item of lists.flat()) {
    const key = normUrl(item?.url || item?.link || "");
    if (!key) continue;

    if (!out.has(key)) {
      const published = publishedOf(item) || item.published || item.date || "";
      out.set(key, {
        ...item,
        url: key,
        published,
        date: toDateShort(published) || item.date || "",
      });
    } else {
      const merged = mergeRecords(out.get(key), item);
      out.set(key, merged);
    }
  }
  // Orden descendente por fecha
  const t = (it) => Date.parse(it.published || it.date || 0) || 0;
  return Array.from(out.values()).sort((a, b) => t(b) - t(a));
}

const prev = loadJSON(FINAL_PATH);
const py   = loadJSON(PY_PATH);
const js   = loadJSON(JS_PATH);

const merged = mergeAll(prev, py, js);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`✅ Artículos fusionados: ${merged.length} → ${FINAL_PATH}`);
