// workspace/scripts/merge-articles.js
import fs from 'fs';

const PY_PATH    = 'workspace/astro/public/articles_py.json';
const JS_PATH    = 'workspace/astro/public/articles_js.json';
const FINAL_PATH = 'workspace/astro/public/articles.json';

const DATE_FIELDS = ['date', 'published', 'publishedAt', 'datePublished'];

function loadJSON(p) {
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function getDate(it) {
  for (const k of DATE_FIELDS) {
    if (it && it[k]) {
      const t = Date.parse(it[k]);
      if (Number.isFinite(t)) return t;
    }
  }
  return 0;
}

function mergeByUrl(...lists) {
  const byUrl = new Map();
  for (const item of lists.flat()) {
    const url = String(item?.url || '').trim();
    if (!url) continue;
    const prev = byUrl.get(url);
    if (!prev) {
      byUrl.set(url, item);
    } else {
      // Si hay duplicado por URL, conserva el más nuevo por fecha
      if (getDate(item) >= getDate(prev)) byUrl.set(url, item);
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => getDate(b) - getDate(a));
}

const prev = loadJSON(FINAL_PATH);   // histórico previo
const py   = loadJSON(PY_PATH);
const js   = loadJSON(JS_PATH);

const merged = mergeByUrl(prev, py, js);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`✅ Artículos fusionados: ${merged.length} → ${FINAL_PATH}`);
