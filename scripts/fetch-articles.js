// scripts/fetch-articles.js
// Recorre SOURCES (RSS/API/HTML), toma 1 artículo por fuente, opcionalmente traduce título.

import fs from "fs";
import path from "path";
import RSSParser from "rss-parser";
import { franc } from "franc";
import { load as cheerioLoad } from "cheerio";

const OUT_PATH = "workspace/astro/public/articles_js.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0 (+https://tu-dominio)";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_ENDPOINT = process.env.DEEPL_ENDPOINT || "https://api-free.deepl.com";
const DEEPL_SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || 1200);
const TRANSLATE_IN_FETCH = process.env.TRANSLATE_IN_FETCH === "1";
const DISABLE_DEEPL = process.env.DISABLE_DEEPL === "1";
const SHOULD_TRANSLATE = TRANSLATE_IN_FETCH && !DISABLE_DEEPL && !!DEEPL_KEY;
// --- Timeouts (evita cuelgues infinitos en GitHub Actions) ---
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);     // APIs (12s)
const RSS_PARSE_TIMEOUT_MS = Number(process.env.RSS_PARSE_TIMEOUT_MS || 12000); // RSS parse (12s)

/** Envuélvelo para que cualquier promesa tenga un timeout duro */
function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Fetch con AbortController + timeout real */
async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS, label = "fetch") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    // Normaliza el mensaje cuando aborta por timeout
    if (err?.name === "AbortError") throw new Error(`${label} timeout after ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
const BASE_SOURCES = [
  { name: "arXiv", url: "http://export.arxiv.org/rss/cs" },
  { name: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10" },
  { name: "Science.org", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science" },
  { name: "Nature", url: "https://www.nature.com/nature.rss" },
  { name: "AEMET", url: "https://www.aemet.es/es/rss_info/avisos/esp" },
  { name: "CNIC", url: "https://www.cnic.es/es/rss.xml" },
  { name: "CNIO", url: "https://www.cnio.es/feed/" },
  { name: "ISCIII", url: "HTML_FALLBACK:https://www.isciii.es/actualidad" },
  { name: "IEO", url: "HTML_FALLBACK:https://www.ieo.es/es_ES/web/ieo/actualidad" },
  { name: "IAC", url: "https://www.iac.es/es/feed_news" }
];

const EXTRA_SOURCES = [
  { name: "NASA (Top News)", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss" },
  { name: "ESA (Top News)", url: "https://www.esa.int/rssfeed/topnews" },
  { name: "CERN News", url: "https://home.cern/api/news/news/feed.rss" },
  { name: "CERN Press", url: "https://home.cern/api/news/press-release/feed.rss" },
  { name: "NIH News Releases", url: "https://www.nih.gov/news-events/news-releases/rss.xml" },
  { name: "NCI (Cancer.gov)", url: "https://www.cancer.gov/rss/news" },
  { name: "Science News", url: "https://www.sciencenews.org/feed" },
  { name: "Science News Explores", url: "https://www.snexplores.org/feed" },
  { name: "ScienceDaily (Top)", url: "https://www.sciencedaily.com/rss/top/science.xml" },
  { name: "Phys.org (Latest)", url: "https://phys.org/rss-feed/" },
  { name: "PNAS (Latest)", url: "https://www.pnas.org/rss/latest" },
  { name: "PLOS ONE", url: "https://journals.plos.org/plosone/feed/atom" },
  { name: "Nature News", url: "https://www.nature.com/nature/articles?type=news&format=rss" },
  { name: "New Scientist", url: "https://www.newscientist.com/feed/home/" },
  { name: "Live Science", url: "https://www.livescience.com/feeds/latest" },
  { name: "SciPost News", url: "https://scipost.org/rss/news/" },
  { name: "Sci.News", url: "https://sci.news/feed" },
  { name: "Undark Magazine", url: "https://undark.org/feed/" },
  { name: "SciPost Publications", url: "https://scipost.org/rss/publications/" },
  { name: "Agencia SINC - Ciencia", url: "https://www.agenciasinc.es/rss/ciencia" }
];

const API_SOURCES = [
  { name: "NASA APOD", url: "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY" },
  { name: "ISS Position", url: "http://api.open-notify.org/iss-now.json" },
  { name: "SpaceX Launches", url: "https://api.spacexdata.com/v5/launches/latest" },
  { name: "Numbers Fact", url: "http://numbersapi.com/random/trivia?json" },
  { name: "Newton (Derivada)", url: "https://newton.vercel.app/api/v2/derive/x^2" }
];

const SOURCES = [...BASE_SOURCES, ...EXTRA_SOURCES, ...API_SOURCES];

const parser = new RSSParser({ timeout: 10000, headers: { "user-agent": USER_AGENT } });

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
function normUrl(u = "") {
  const s = String(u || "").trim();
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
function stripTags(html = "") {
  return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  return "";
}

function safeISODate(value) {
  const s = pick(value, "");
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
function mapRssItemToArticle(item, sourceName) {
  const link = pick(item.link, item.guid, item.id, item.url);
  const url = normUrl(link);
  const title = stripTags(pick(item.title, item["dc:title"], ""));
  const published = safeISODate(pick(item.pubDate, item.published, item.updated, item.isoDate));
  const date = published ? published.slice(0, 10) : "";
  return { title, title_es: title, url, published, date, source: sourceName };
}

async function fetchFromAPI(name, url) {
  try {
    const res = await fetchWithTimeout(
  url,
  { headers: { "user-agent": USER_AGENT } },
  FETCH_TIMEOUT_MS,
  `[${name}] API fetch`
);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (name === "NASA APOD") return { title: data.title, title_es: data.title, url: data.url || data.hdurl, date: "", published: "", source: name };
    if (name === "ISS Position") return { title: "ISS Current Position", title_es: "ISS Current Position", url: `https://www.latlong.net/c/?lat=${data.iss_position.latitude}&long=${data.iss_position.longitude}`, date: "", published: "", source: name };
    if (name === "SpaceX Launches") return { title: data.name, title_es: data.name, url: data.links?.webcast || "https://spacex.com", date: "", published: "", source: name };
    if (name === "Numbers Fact") return { title: data.text, title_es: data.text, url: "http://numbersapi.com", date: "", published: "", source: name };
    if (name === "Newton (Derivada)") return { title: `Derivada de x^2: ${data.result}`, title_es: `Derivada de x^2: ${data.result}`, url: "https://newton.now.sh", date: "", published: "", source: name };
  } catch (e) {
    console.warn(`[${name}] API error:`, e?.message || String(e));
    return null;
  }
}

async function fetchRSS(url, name) {
  try {
    const feed = await withTimeout(
  parser.parseURL(url),
  RSS_PARSE_TIMEOUT_MS,
  `[${name}] RSS parse`
);
    const items = feed.items || [];
    return items.map(it => mapRssItemToArticle(it, name));
  } catch (e) {
    console.warn(`[${name}] RSS error:`, e?.message || String(e));
    return [];
  }
}

async function fetchAll() {
  const picked = [];
  const seen = new Set();
  for (const src of SOURCES) {
    let articles = [];
    if (API_SOURCES.some(s => s.name === src.name)) {
      const a = await fetchFromAPI(src.name, src.url);
      if (a) articles = [a];
    } else if (src.url.startsWith("HTML_FALLBACK:")) {
      console.warn(`[${src.name}] HTML fallback desactivado en fetch-articles.js`);
      continue;
    } else {
      articles = await fetchRSS(src.url, src.name);
    }
    for (const art of articles) {
      if (!art.url) continue;
      const key = normUrl(art.url);
      if (seen.has(key)) continue;
      picked.push(art);
      seen.add(key);
      break; // solo uno por fuente
    }
  }
  ensureDirFor(OUT_PATH);
  fs.writeFileSync(OUT_PATH, JSON.stringify(picked, null, 2));
  console.log(`Guardados ${picked.length} artículos en ${OUT_PATH}`);
}

}

fetchAll().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
