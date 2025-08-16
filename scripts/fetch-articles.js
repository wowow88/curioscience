// scripts/fetch-articles.js
// — Modo secuencial 1-por-fuente —
// Recorre RSS_SOURCES en orden, toma 1 artículo por fuente (más reciente),
// lo traduce si no está en ES y pasa a la siguiente. Evita duplicados.
// Salida: workspace/astro/public/articles_js.json

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import RSSParser from "rss-parser";
import { franc } from "franc"; // ISO 639-3 (eng, spa, ...)

const OUT_PATH = "workspace/astro/public/articles_js.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_ENDPOINT = process.env.DEEPL_ENDPOINT || "https://api-free.deepl.com"; // Free por defecto
const PER_SOURCE = Number(process.env.PER_SOURCE || 1);        // 👈 1 artículo por fuente
const DEEPL_SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || 1200);

const RSS_SOURCES = [
  { name: "arXiv",       url: "http://export.arxiv.org/rss/cs" },
  { name: "PubMed",      url: "https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10" },
  { name: "Science.org", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science" },
  { name: "Nature",      url: "https://www.nature.com/nature.rss" },
  { name: "AEMET",       url: "https://www.aemet.es/xml/boletin.rss" },
  { name: "CNIC",        url: "https://www.cnic.es/es/rss.xml" },
  { name: "CNIO",        url: "https://www.cnio.es/feed/" },
  { name: "ISCIII",      url: "https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1" },
  { name: "IEO",         url: "https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss" },
  { name: "IAC",         url: "https://www.iac.es/en/rss.xml" },
];

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
  if (!DEEPL_KEY || !text) return text;
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
  const link = pick(item.link?.href, item.link, item.id, item.guid, item.url);
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

async function fetchRSS(url, sourceName){
  try{
    const feed = await parser.parseURL(url);
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
  if (!DEEPL_KEY) return article;
  const detected = detectDeepLLang(`${article.title} ${article.content_es}`) || "EN";
  if (detected === "ES") return { ...article, title_es: article.title, content_es: article.content_es };
  const title_es   = await deeplTranslate(article.title,      "ES", detected);
  await new Promise(r=>setTimeout(r, DEEPL_SLEEP_MS));
  const content_es = await deeplTranslate(article.content_es, "ES", detected);
  return { ...article, title_es: title_es || article.title, content_es: content_es || article.content_es };
}

async function main(){
  console.log("::group::fetch-articles.js (secuencial 1 por fuente)");
  const picked = [];
  const perSrcCount = new Map();
  const seen = new Set();

  for (const src of RSS_SOURCES){
    try{
      const list = sortByDateDesc(await fetchRSS(src.url, src.name));
      let taken = 0;
      for (const it of list){
        if (!it.url || seen.has(it.url)) continue;
        let art = await translateIfNeeded(it);
        picked.push(art);
        seen.add(it.url);
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
