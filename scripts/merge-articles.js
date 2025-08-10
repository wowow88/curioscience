// scripts/merge-articles.js
import fs from 'fs';

const PY_PATH    = 'workspace/astro/public/articles_py.json';
const JS_PATH    = 'workspace/astro/public/articles_js.json';
const FINAL_PATH = 'workspace/astro/public/articles.json';

function loadJSON(p) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : []; }
function isoDate(s)  { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0,10) : ''; }

// Orden de preferencia para fecha de publicación real
const DATE_FIELDS = ['published', 'pubDate', 'datePublished', 'date'];

function publishedOf(it) {
  for (const k of DATE_FIELDS) {
    const v = it?.[k];
    const d = isoDate(v);
    if (d) return d;
  }
  return '';
}

// Fusiona manteniendo la fecha histórica y completando campos vacíos
function mergeRecords(prev, inc) {
  const prevPub = publishedOf(prev);
  const incPub  = publishedOf(inc);
  const published = prevPub || incPub;              // 👈 nunca perdemos la histórica
  const date      = published;                       // alias usado por la web

  // completa campos vacíos con lo nuevo, pero sin tocar la fecha
  return {
    ...prev,
    ...inc,
    published,
    date,
  };
}

function keyOf(it) {
  return String(it?.url || '').trim().toLowerCase().replace(/[#?].*$/, '');
}

function mergeAll(...lists) {
  const out = new Map();
  for (const item of lists.flat()) {
    const k = keyOf(item);
    if (!k) continue;
    if (!out.has(k)) {
      // normaliza fecha al entrar
      const published = publishedOf(item);
      out.set(k, { ...item, published, date: published || item.date || '' });
    } else {
      const merged = mergeRecords(out.get(k), item);
      out.set(k, merged);
    }
  }
  // orden descendente por fecha de publicación real
  return Array.from(out.values()).sort((a, b) => (isoDate(b.published || b.date) > isoDate(a.published || a.date) ? 1 : -1));
}

const prev = loadJSON(FINAL_PATH);   // histórico previo
const py   = loadJSON(PY_PATH);
const js   = loadJSON(JS_PATH);

const merged = mergeAll(prev, py, js);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`✅ Artículos fusionados: ${merged.length} → ${FINAL_PATH}`);
