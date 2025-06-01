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
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9 ]/gi, '') // quitar símbolos excepto espacios
    .replace(/\b(pdf|articulo completo|leer mas)\b/g, '') // quitar palabras irrelevantes
    .replace(/\s+/g, ' ') // colapsar espacios
    .trim();
}

function mergeArticles(pyArticles, jsArticles) {
  const titleMap = new Map();

  [...pyArticles, ...jsArticles].forEach(article => {
    const baseTitle = article.title_es || article.title || '';
    const key = normalize(baseTitle);
    if (!titleMap.has(key)) {
      titleMap.set(key, article);
    }
  });

  return Array.from(titleMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

const pyArticles = loadJSON(PY_PATH);
const jsArticles = loadJSON(JS_PATH);
const merged = mergeArticles(pyArticles, jsArticles);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`Merged ${merged.length} articles.`);
