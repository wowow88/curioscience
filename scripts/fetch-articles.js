// scripts/fetch-articles.js
// — Modo secuencial 1-por-fuente — (actualizado con nuevas fuentes y fallbacks)
// Recorre S SOURCES en orden, toma 1 artículo por fuente (más reciente),
// lo traduce si no está en ES y pasa a la siguiente. Evita duplicados.
// Salida: workspace/astro/public/articles_js.json

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import RSSParser from "rss-parser";
import { franc } from "franc"; // ISO 639-3 (eng, spa, ...)
import { load as cheerioLoad } from "cheerio";  // ⬅️ para fallbacks HTML (ISCIII/IEO)

const OUT_PATH = "workspace/astro/public/articles_js.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_ENDPOINT = process.env.DEEPL_ENDPOINT || "https://api-free.deepl.com"; // Free por defecto
const DEEPL_SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || 1200);
const TRANSLATE_IN_FETCH = process.env.TRANSLATE_IN_FETCH !== '0'; // pon '0' en el YAML si quieres que NO traduzca aquí

// —— Fuentes base (las que ya tenías, con correcciones) ——
const BASE_SOURCES = [
  { name: "arXiv",       url: "http://export.arxiv.org/rss/cs" },
  { name: "PubMed",      url: "https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10" },
  { name: "Science.org", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science" },
  { name: "Nature",      url: "https://www.nature.com/nature.rss" },
  // AEMET: usa feed oficial (ejemplo: avisos a nivel nacional)
  { name: "AEMET",       url: "https://www.aemet.es/es/rss_info/avisos/esp" },
  { name: "CNIC",        url: "https://www.cnic.es/es/rss.xml" },
  { name: "CNIO",        url: "https://www.cnio.es/feed/" },
  // ISCIII/IEO: RSS inestable → hacemos fallback por HTML
  { name: "ISCIII",      url: "HTML_FALLBACK:https://www.isciii.es/actualidad" },
  { name: "IEO",         url: "HTML_FALLBACK:https://www.ieo.es/es_ES/web/ieo/actualidad" },
  // IAC: feed oficial de noticias
  { name: "IAC",         url: "https://www.iac.es/es/feed_news" },
];

// —— Fuentes nuevas recomendadas ——
const EXTRA_SOURCES = [
  // Agencias espaciales
  { name: 'NASA (Top News)', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
  { name: 'ESA (Top News)',  url: 'https://www.esa.int/rssfeed/topnews' },

  // Física / grandes infraestructuras
  { name: 'CERN News',       url: 'https://home.cern/api/news/news/feed.rss' },
  { name: 'CERN Press',      url: 'https://home.cern/api/news/press-release/feed.rss' },

  // Salud / biomedicina
  { name: 'NIH News Releases', url: 'https://www.nih.gov/news-events/news-releases/rss.xml' },
  { name: 'NCI (Cancer.gov)',  url: 'https://www.cancer.gov/rss/news' },

  // Divulgación internacional
  { name: 'Science News',          url: 'https://www.sciencenews.org/feed' },
  { name: 'Science News Explores', url: 'https://www.snexplores.org/feed' },
  { name: 'ScienceDaily (Top)',    url: 'https://www.sciencedaily.com/rss/top/science.xml' },
  { name: 'Phys.org (Latest)',     url: 'https://phys.org/rss-feed/' },

  // Revistas
  { name: 'PNAS (Latest)',  url: 'https://www.pnas.org/rss/latest' },
  { name: 'PLOS ONE',       url: 'https://journals.plos.org/plosone/feed/atom' },
  { name: 'Nature News',    url: 'https://www.nature.com/nature/articles?type=news&format=rss' },

  // España
  { name: 'Agencia SINC - Ciencia', url: 'https://www.agenciasinc.es/rss/ciencia' },
];

// —— Unimos fuentes, evitando duplicar URLs exactas ——
const URL_SEEN = new Set();
const RSS_SOURCES = [...BASE_SOURCES, ...EXTRA_SOURCES].filter(s => {
  const key = `${s.name}|${s.url}`.toLowerCase();
  if (URL_SEEN.has(key)) return false; URL_SEEN.add(key); return true;
});

const parser = new RSSParser({ timeout: 10000, headers: { "user-agent": USER_AGENT } });

function ensureDirFor(filePath){ fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
function toISO(d){ const t = d ? Date.parse(d) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : ""; }
function toDateShort(d){ const iso = toISO(d); return iso ? iso.slice(0,10) : ""; }
function pick(...vals){ for (const v of vals) if (v!==undefined && v!==null && String(v).trim()!=="") return String(v); return ""; }
function normUrl(u=""){ const s=String(u||"").trim(); if(!s) return ""; try{ const url=new URL(s); url.hash=""; url.search=""; return url.toString().toLowerCase(); }catch{ return s.toLowerCase(); } }
function stripTags(html=""){ return String(html).replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"); }

// franc (ISO-639-3) -> DeepL (2 letras)
const LANG_MAP = { eng:"EN", spa:"ES", fra:"FR", deu:"DE", ita:"IT", por:"PT", nld:"NL", pol:"PL", rus:"RU", jpn:"JA", zho:"ZH", bul:"BG", ces:"CS", dan:"DA", ell:"EL", est:"ET", fin:"FI", hun:"HU", lit:"LT", lav:"LV", ron:"RO", slk:"SK", slv:"SL", swe:"SV", tur:"TR", ukr:"UK" };
function detectDeepLLang(text){
  const sample = String(text || "").slice(0, 800);
  const code3 = franc(sample, { minLength: 10 }); // 'eng' | 'spa' | 'und'...
  return LANG_MAP[code3]; // undefined ⇒ dejaremos EN por defecto
}

async function deeplTranslate(text, targetLang, sourceLang){
  if (!DEEPL_KEY || !text || !TRANSLATE_IN_FETCH) return text;
  const body = new URLSearchParams();
  body.set("text", String(text).slice(0, 4000));
  body.set("target_lang", String(targetLang || "ES").toUpperCase());
  if (sourceLang) body.set("source_lang", String(sourceLang).toUpperCase());
  try{
    const res = await fetch(`${DEEPL_ENDPOINT}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok){ console.warn(`[translate] ${DEEPL_ENDPOINT} HTTP ${res.status}`); return text; }
    const data = await res.json();
    return data?.translations?.[0]?.text || text;
  }catch(e){ console.warn("[translate]", e.message); return text; }
}

function mapRssItemToArticle(item, sourceName){
  const link = pick(
    item.link?.href,
    item.link,
    item.links?.[0]?.href,
    item.links?.[0]?.url,
    item.guid,
    item.id,
    item.url
  );
  const url = normUrl(link);
  const titleRaw = pick(item.title, item["title#text"], item["dc:title"], "");
  const summaryRaw = pick(item.contentSnippet, item.summary, item.description, item.content, "");
  const title = stripTags(titleRaw);
  const summary = stripTags(summaryRaw);
  const publishedISO = toISO(pick(item.pubDate, item.published, item.updated, item.isoDate, item.date));
  const dateShort = publishedISO ? publishedISO.slice(0,10) : "";
  const contentSeed = summary || title; // nunca vacío
  return { title, title_es: title, url, published: publishedISO || "", date: dateShort, content_es: contentSeed, source: sourceName };
}

async function parseRSSWithRetry(url, tries=3){
  for (let i=0; i<tries; i++){
    try{ return await parser.parseURL(url); }
    catch(e){ if (i===tries-1) throw e; await new Promise(r=>setTimeout(r, 1200)); }
  }
}

async function fetchRSS(url, sourceName){
  try{
    const feed = await parseRSSWithRetry(url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map(it => mapRssItemToArticle(it, sourceName));
  }catch(e){
    console.warn(`[${sourceName}] Error RSS:`, e.message);
    return [];
  }
}

function sortByDateDesc(list){
  return [...list].sort((a,b)=> (Date.parse(b.date||b.published||0)||0) - (Date.parse(a.date||a.published||0)||0));
}

async function translateIfNeeded(article){
  if (!TRANSLATE_IN_FETCH || !DEEPL_KEY) return article;
  const detected = detectDeepLLang(`${article.title} ${article.content_es}`) || "EN";
  if (detected === "ES") return { ...article, title_es: article.title, content_es: article.content_es };
  const title_es   = await deeplTranslate(article.title,      "ES", detected);
  await new Promise(r=>setTimeout(r, DEEPL_SLEEP_MS));
  const content_es = await deeplTranslate(article.content_es, "ES", detected);
  return { ...article, title_es: title_es || article.title, content_es: content_es || article.content_es };
}

// ——— FallBack HTML sencillo para ISCIII/IEO ———
function isHtmlFallback(u){ return String(u).startsWith('HTML_FALLBACK:'); }
function realUrl(u){ return isHtmlFallback(u) ? u.replace('HTML_FALLBACK:', '') : u; }

async function fetchHTMLList(url, sourceName){
  try{
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerioLoad(html);
    const items = [];

    if (sourceName === 'ISCIII') {
      // Página “Actualidad” – titulares con enlaces (Liferay)
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (href && title && title.length > 8) {
          const abs = new URL(href, url).toString();
          items.push({ title, title_es: title, url: abs, date: '', published: '', content_es: title, source: sourceName });
        }
      });
    } else if (sourceName === 'IEO') {
      // Página “Actualidad” del IEO
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (href && title && title.length > 8) {
          const abs = new URL(href, url).toString();
          items.push({ title, title_es: title, url: abs, date: '', published: '', content_es: title, source: sourceName });
        }
      });
    }
    // devolvemos una pequeña lista; luego elegimos 1
    return items.slice(0, 5);
  } catch (e) {
    console.warn(`[${sourceName}] HTML fallback error: ${e.message}`);
    return [];
  }
}

async function main(){
  console.log("::group::fetch-articles.js (secuencial 1 por fuente)");
  const picked = [];
  const perSrcCount = new Map();
  const seen = new Set();

  for (const src of RSS_SOURCES){
    const url = realUrl(src.url);
    try{
      const list = isHtmlFallback(src.url)
        ? (await fetchHTMLList(url, src.name))
        : sortByDateDesc(await fetchRSS(url, src.name));

      let taken = 0;
      for (const it of list){
        if (!it.url) continue;
        const key = normUrl(it.url);
        if (!key || seen.has(key)) continue;
        const art = await translateIfNeeded(it);
        picked.push(art);
        seen.add(key);
        taken++;
        perSrcCount.set(src.name, (perSrcCount.get(src.name)||0)+1);
        break; // 👈 sólo 1 por fuente
      }
      console.log(`  [${src.name}] tomado: ${taken}`);
    }catch(e){
      console.warn(`  [${src.name}] error:`, e.message);
    }
  }

  // Guardar
  const out = sortByDateDesc(picked);
  console.log(`Total seleccionados: ${out.length}`);
  for (const [s,n] of perSrcCount) console.log(`  - ${s}: ${n}`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Guardados ${out.length} artículos en ${OUT_PATH}`);
  console.log("::endgroup::");
}

main().catch(e=>{ console.error(e); process.exit(1); });
