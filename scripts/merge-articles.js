// scripts/merge-articles.js
// - Fusiona histórico + PY + JS SIN perder traducciones previas.
// - Deduplica por URL normalizada (sin hash ni query).
// - NO pisa campos con vacíos: si llega "" no borra previos.
// - NO crea ni publica `content_es`.
// - NO copia `title` -> `title_es` (solo mantiene el real).
// - Evita machacar un title_es previo con uno "placebo" (igual a title).
// - Orden final por fecha descendente.

import fs from "fs";

const PY_PATH    = process.env.PY_JSON    || "workspace/astro/public/articles_py.json";
const JS_PATH    = process.env.JS_JSON    || "workspace/astro/public/articles_js.json";
const FINAL_PATH = process.env.FINAL_JSON || "workspace/astro/public/articles.json";

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

// Evita que un title_es entrante igual a su title machaque un title_es histórico
function pickTitleEs(prevEs, incEs, incTitle) {
  if (!isNonEmpty(incEs)) return prevEs;
  const incEsNorm = String(incEs).trim();
  const incTitleNorm = String(incTitle || "").trim();
  if (incEsNorm === incTitleNorm) return prevEs; // "placebo": mantenemos el previo
  return incEs;
}

function mergeRecords(prev, inc) {
  // Clave común ya es la URL normalizada
  const base = { ...prev, ...inc };

  // Fecha de publicación: prioridad histórico
  const prevPub = publishedOf(prev);
  const incPub  = publishedOf(inc);
  const published = prevPub || incPub || base.published || base.date || "";

  // Campos que no deben ser pisados por vacíos
  const title    = pickNewNoBlank(prev.title,    inc.title);
  const summary  = pickNewNoBlank(prev.summary,  inc.summary);
  const source   = pickNewNoBlank(prev.source,   inc.source);
  const title_es = pickTitleEs(prev.title_es, inc.title_es, inc.title); // ⬅️ protegido

  const merged = {
    ...base,
    url: normUrl(base.url || prev.url || inc.url || ""),
    title,
    title_es, // ya hidratado si existía antes
    summary,
    source,
    published,
    date: toDateShort(published) || base.date || "",
  };

  // NUNCA publicar content_es
  if ("content_es" in merged) delete merged.content_es;

  return merged;
}

function mergeAll(...lists) {
  const out = new Map();
  for (const item of lists.flat()) {
    if (!item) continue;

    // Limpia content_es ya desde la entrada
    const clean = { ...item };
    if ("content_es" in clean) delete clean.content_es;

    const key = normUrl(clean?.url || clean?.link || "");
    if (!key) continue;

    if (!out.has(key)) {
      const published = publishedOf(clean) || clean.published || clean.date || "";
      out.set(key, {
        ...clean,
        url: key,
        published,
        date: toDateShort(published) || clean.date || "",
      });
    } else {
      const merged = mergeRecords(out.get(key), clean);
      out.set(key, merged);
    }
  }

  // Orden descendente por fecha
  const t = (it) => Date.parse(it.published || it.date || 0) || 0;
  return Array.from(out.values()).sort((a, b) => t(b) - t(a));
}

// Carga listas
const prev = loadJSON(FINAL_PATH);
const py   = loadJSON(PY_PATH);
const js   = loadJSON(JS_PATH);

// Merge incluyendo histórico para hidratar title_es ya traducidos
let merged = mergeAll(prev, py, js);

// Garantía final: quitar cualquier content_es rezagado
merged = merged.map(({ content_es, ...rest }) => rest);

// Escribir resultado
fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2), "utf8");
console.log(`✅ Artículos fusionados: ${merged.length} → ${FINAL_PATH}`);
