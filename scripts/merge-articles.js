// workspace/scripts/merge-articles.js
import fs from 'fs';

const PY_PATH = './workspace/astro/public/articles_py.json';
const JS_PATH = './workspace/astro/public/articles_js.json';
const FINAL_PATH = './workspace/astro/public/articles.json';

function loadJSON(path) {
  if (!fs.existsSync(path)) return [];
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function mergeByUrl(...lists) {
  const byUrl = new Map();
  for (const a of lists.flat()) {
    const url = (a?.url || '').trim();
    if (!url) continue;
    // La política: si llega un duplicado por URL, nos quedamos con el más nuevo por fecha
    const prev = byUrl.get(url);
    if (!prev) byUrl.set(url, a);
    else {
      const dNew = Date.parse(a.date || a.published || a.publishedAt || 0);
      const dOld = Date.parse(prev.date || prev.published || prev.publishedAt || 0);
      if (dNew >= dOld) byUrl.set(url, a);
    }
  }
  return Array.from(byUrl.values()).sort(
    (a, b) => Date.parse(b.date || b.published || b.publishedAt || 0) - Date.parse(a.date || a.published || a.publishedAt || 0)
  );
}

const prev = loadJSON(FINAL_PATH);              // 👈 incluye histórico previo (antes no se hacía)
const py = loadJSON(PY_PATH);
const js = loadJSON(JS_PATH);

const merged = mergeByUrl(prev, py, js);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`✅ Artículos fusionados: ${merged.length} guardados en ${FINAL_PATH}`);

