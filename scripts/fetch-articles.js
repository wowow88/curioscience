// scripts/fetch-articles.js
// Obtiene artículos de varias fuentes RSS/JSON, traduce si hay clave DEEPL,
// NO sobrescribe fechas históricas (no inventa "hoy"), deduplica por URL
// y escribe en workspace/astro/public/articles_js.json
//
// Requisitos ya cubiertos por tu workflow:
//   - node >= 20 (ESM)
//   - dependencias: node-fetch@3, rss-parser, franc (esta última es opcional aquí)
//   - variables opcionales: DEEPL_API_KEY (para traducción)
//
// ⚠️ Rellena RSS_SOURCES con las URLs reales de tus feeds.

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import RSSParser from "rss-parser";

// =========================
// Configuración
// =========================
const OUT_PATH = "workspace/astro/public/articles_js.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";

// 1) Añade aquí tus fuentes RSS (o deja vacío y este script no fallará)
//    Formato: { name: "Fuente", url: "https://..." }
const RSS_SOURCES = [
  { name: 'arXiv', url: 'http://export.arxiv.org/rss/cs' },
  { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10' },
  { name: 'Science.org', url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science' },
  { name: 'Nature', url: 'https://www.nature.com/nature.rss' },
  { name: 'AEMET', url: 'https://www.aemet.es/xml/boletin.rss' },
  { name: 'CNIC', url: 'https://www.cnic.es/es/rss.xml' },
  { name: 'CNIO', url: 'https://www.cnio.es/feed/' },
  { name: 'ISCIII', url: 'https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1' },
  { name: 'IEO', url: 'https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss' },
  { name: 'IAC', url: 'https://www.iac.es/en/rss.xml' }
];

// Si también tienes fuentes JSON, puedes listarlas aquí
// const JSON_SOURCES = [
//   { name: "NatureAPI", url: "https://api.nature.com/..", map: (json) => [] },
// ];

// =========================
// Utilidades
// =========================
const parser = new RSSParser({
  timeout: 10000,
  headers: { "user-agent": USER_AGENT },
});

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function toISO(dateLike) {
  if (!dateLike) return "";
  const t = Date.parse(dateLike);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString(); // formato completo ISO-8601
}

function normUrl(u = "") {
  const s = String(u).trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    url.hash = ""; // quita fragmentos
    url.search = ""; // quita query-string para evitar duplicados por tracking
    return url.toString().toLowerCase();
  } catch {
    // Si no es URL válida, déjala en bruto
    return s.toLowerCase();
  }
}

async function translateIfPossible(text, targetLang = "es") {
  if (!DEEPL_KEY || !text) return text;
  try {
    const params = new URLSearchParams();
    params.set("text", text.slice(0, 4000)); // límite prudente
    params.set("target_lang", targetLang.toUpperCase());

    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
    const data = await res.json();
    const translated = data?.translations?.[0]?.text;
    return translated || text;
  } catch (e) {
    console.warn("[translate]", e.message);
    return text; // no bloquea
  }
}

function mapRssItemToArticle(item, sourceName) {
  // rss-parser devuelve link como string; a veces como objeto con href
  const link = item.link?.href || item.link || item.id || "";
  const url = normUrl(link);
  // No inventamos fechas: usamos lo que venga o vacío
  const publishedISO = toISO(
    item.pubDate || item.published || item.updated || item.isoDate || item.date
  );

  return {
    title: item.title || "",
    url,
    published: publishedISO || "",
    date: publishedISO || "", // compatibilidad con la web actual
    summary: item.contentSnippet || item.content || "",
    source: sourceName,
  };
}

async function fetchRSS(url, sourceName) {
  try {
    const feed = await parser.parseURL(url);
    const items = feed.items || [];
    return items.map((it) => mapRssItemToArticle(it, sourceName));
  } catch (e) {
    // Algunos feeds traen XML "sucio" (Attribute without value). Aquí preferimos no romper.
    console.warn(`[${sourceName}] Error RSS:`, e.message);
    return [];
  }
}

async function fetchJSON(url, sourceName, mapFn) {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const arr = (mapFn && mapFn(data)) || [];
    return arr.map((it) => ({ ...it, source: sourceName }));
  } catch (e) {
    console.warn(`[${sourceName}] Error JSON:`, e.message);
    return [];
  }
}

function dedupeByUrl(articles) {
  const out = [];
  const seen = new Set();
  for (const it of articles) {
    const k = normUrl(it.url);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ ...it, url: k });
  }
  return out;
}

function sortByPublishedDesc(articles) {
  return [...articles].sort((a, b) => {
    const ta = Date.parse(a.published || a.date || 0) || 0;
    const tb = Date.parse(b.published || b.date || 0) || 0;
    return tb - ta;
  });
}

async function maybeTranslateFields(article) {
  // Traduce solo si hay clave; si no, devuelve el original
  if (!DEEPL_KEY) return article;
  const title_es = await translateIfPossible(article.title || "", "ES");
  const summary_es = await translateIfPossible(article.summary || "", "ES");
  return { ...article, title_es, summary_es };
}

async function main() {
  console.log("::group::fetch-articles.js");
  const tasks = [];

  for (const s of RSS_SOURCES) {
    tasks.push(fetchRSS(s.url, s.name));
  }
  // Si habilitas JSON_SOURCES, descomenta:
  // for (const s of JSON_SOURCES) tasks.push(fetchJSON(s.url, s.name, s.map));

  const results = (await Promise.all(tasks)).flat();
  let articles = dedupeByUrl(results);

  // Traducción opcional (DeepL). Limita para no exceder cuota.
  // Quita el slice si quieres traducir todo.
  if (DEEPL_KEY && articles.length) {
    const translated = [];
    for (const it of articles.slice(0, 50)) {
      translated.push(await maybeTranslateFields(it));
    }
    // Mantén el resto sin traducir para ahorrar cuota
    articles = [...translated, ...articles.slice(50)];
  }

  // Orden final por fecha descendente; si falta fecha, quedan al final
  articles = sortByPublishedDesc(articles);

  ensureDirFor(OUT_PATH);
  fs.writeFileSync(OUT_PATH, JSON.stringify(articles, null, 2));
  console.log(`Guardados ${articles.length} artículos únicos en ${OUT_PATH}`);
  console.log("::endgroup::");
}

main().catch((err) => {
  console.error("Fallo inesperado en fetch-articles:", err);
  // No tumbamos el pipeline por scraping puntual
  try {
    ensureDirFor(OUT_PATH);
    if (!fs.existsSync(OUT_PATH)) fs.writeFileSync(OUT_PATH, "[]");
  } catch {}
  process.exit(0);
});
