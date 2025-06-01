import fs from 'fs';

const PY_PATH = './workspace/astro/public/articles_py.json';
const JS_PATH = './workspace/astro/public/articles_js.json';
const FINAL_PATH = './workspace/astro/public/articles.json';

function loadJSON(path) {
  if (!fs.existsSync(path)) return [];
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function mergeArticles(pyArticles, jsArticles) {
  const map = new Map();
  [...pyArticles, ...jsArticles].forEach(article => {
    if (!map.has(article.url)) {
      map.set(article.url, article);
    }
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

const pyArticles = loadJSON(PY_PATH);
const jsArticles = loadJSON(JS_PATH);
const merged = mergeArticles(pyArticles, jsArticles);

fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2));
console.log(`Merged ${merged.length} articles.`);
