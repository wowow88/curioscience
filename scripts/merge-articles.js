import fs from 'fs';

const PY_PATH = './workspace/astro/public/articles_py.json';
const JS_PATH = './workspace/astro/public/articles_js.json';
const FINAL_PATH = './workspace/astro/public/articles.json';

function loadJSON(path) {
  if (!fs.existsSync(path)) return [];
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/gi, '')
    .replace(/\b(pdf|articulo completo|leer mas)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeArticles(...articleLists) {
  const urlMap = new Map();
  const titleMap = new Map();

  articleLists.flat().forEach(article => {
    if (article.url && !urlMap.has(article.url)) {
      urlMap.set(article.url, article);
      const titleKey = normalize(article.title_es || article.title || '');
      if (!titleMap.has(titleKey)) {
        titleMap.set(titleKey, article);
      }
    }
  });

  return Array.from(titleMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

const pyArticles = loadJSON(PY_PATH);
const jsArticles = loadJSON(JS_PATH);
const merged = mergeArticles(pyArticles, jsArticles);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`✅ Artículos fusionados: ${merged.length} guardados en ${FINAL_PATH}`);
