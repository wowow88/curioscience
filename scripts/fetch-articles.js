// scripts/fetch-articles.js (actualizado)
// - Alineado al esquema de tu web: title, title_es, url, date (YYYY-MM-DD), source, content_es
// - Nunca devuelve campos undefined (si falta algo, usa "")
// - No inventa fechas: si el feed no trae fecha, la deja vacía
// - Traducción opcional con DeepL (si hay DEEPL_API_KEY)

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import RSSParser from "rss-parser";

const OUT_PATH = "workspace/astro/public/articles_js.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";

// === TUS FEEDS ===
const RSS_SOURCES = [
  { name: 'arXiv',       url: 'http://export.arxiv.org/rss/cs' },
  { name: 'PubMed',      url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10' },
  { name: 'Science.org', url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science' },
  { name: 'Nature',      url: 'https://www.nature.com/nature.rss' },
  { name: 'AEMET',       url: 'https://www.aemet.es/xml/boletin.rss' },
  { name: 'CNIC',        url: 'https://www.cnic.es/es/rss.xml' },
  { name: 'CNIO',        url: 'https://www.cnio.es/feed/' },
  { name: 'ISCIII',      url: 'https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1' },
  { name: 'IEO',         url: 'https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss' },
  { name: 'IAC',         url: 'https://www.iac.es/en/rss.xml' },
];

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
  return new Date(t).toISOString();
}

function toDateShort(dateLike) {
  const iso = toISO(dateLike);
  return iso ? iso.slice(0, 10) : ""; // YYYY-MM-DD
}

function normUrl(u = "") {
  const s = String(u || "").trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    url.hash = ""; // evita duplicados por #
    url.search = ""; // evita duplicados por query tracking
    return url.toString().toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

async function translateIfPossible(text, targetLang = "es") {
  if (!DEEPL_KEY || !text) return text;
  try {
    const params = new URLSearchParams();
    params.set("text", String(text).slice(0, 4000));
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
    return data?.translations?.[0]?.text || text;
  } catch (e) {
    console.warn("[translate]", e.message);
    return text;
  }
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  return "";
}

function mapRssItemToArticle(item, sourceName) {
  const link = pick(item.link?.href, item.link, item.id, item.guid, item.url);
  const url = normUrl(link);

  const title = pick(item.title, item["title#text"], item["dc:title"], "");

  const publishedISO = toISO(pick(item.pubDate, item.published, item.updated, item.isoDate, item.date));
  const dateShort = publishedISO ? publishedISO.slice(0, 10) : "";

  const summary = pick(item.contentSnippet, item.summary, item.description, item.content, "");

  // Campos alineados con tu web; sin undefined
  return {
    title,
    title_es: title,             // si no hay DeepL, queda igual y la web no muestra "undefined"
    url,
    published: publishedISO || "",
    date: dateShort,             // YYYY-MM-DD
    content_es: summary,         // la web espera content_es
    source: sourceName,
  };
}

async function fetchRSS(url, sourceName) {
  try {
    const feed = await parser.parseURL(url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map((it) => mapRssItemToArticle(it, sourceName));
  } catch (e) {
    console.warn(`[${sourceName}] Error RSS:`, e.message);
    return [];
  }
}

function dedupeByUrl(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const k = normUrl(it.url);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ ...it, url: k });
  }
  return out;
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.date || a.published || 0) || 0;
    const tb = Date.parse(b.date || b.published || 0) || 0;
    return tb - ta;
  });
}

async function maybeTranslate(article) {
  if (!DEEPL_KEY) return article;
  const title_es = await translateIfPossible(article.title, "ES");
  const content_es = await translateIfPossible(article.content_es, "ES");
  return { ...article, title_es, content_es };
}

async function main() {
  console.log("::group::fetch-articles.js");
  const results = (await Promise.all(RSS_SOURCES.map(s => fetchRSS(s.url, s.name)))).flat();
  let articles = dedupeByUrl(results);

  // Traducción opcional (limita para cuidar cuota)
  if (DEEPL_KEY && articles.length) {
    const translated = [];
    for (const it of articles.slice(0, 50)) translated.push(await maybeTranslate(it));
    articles = [...translated, ...articles.slice(50)];
  }

  articles = sortByDateDesc(articles);

  ensureDirFor(OUT_PATH);
  fs.writeFileSync(OUT_PATH, JSON.stringify(articles, null, 2));
  console.log(`Guardados ${articles.length} artículos únicos en ${OUT_PATH}`);
  console.log("::endgroup::");
}

main().catch((err) => {
  console.error("Fallo inesperado en fetch-articles:", err);
  try {
    ensureDirFor(OUT_PATH);
    if (!fs.existsSync(OUT_PATH)) fs.writeFileSync(OUT_PATH, "[]");
  } catch {}
  process.exit(0);
});
