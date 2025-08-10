// scripts/backfill-translate.js (corregido)
// Traduce artículos HISTÓRICOS en workspace/astro/public/articles.json
// Rellena title_es y content_es cuando falten, estén en inglés o title_es == title.
// No cambia date/published ni el orden del array. Hace backup antes de escribir.
// Uso:
//   DEEPL_API_KEY=xxx node scripts/backfill-translate.js
// Opcionales: DEEPL_ENDPOINT (default: https://api-free.deepl.com), BACKFILL_LIMIT (400), SLEEP_MS (800)

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { franc } from "franc";

const FILE = "workspace/astro/public/articles.json";
const BACKUP = "workspace/astro/public/articles.backup.json";
const USER_AGENT = process.env.USER_AGENT || "curioscience-bot/1.0";
const DEEPL_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_ENDPOINT = process.env.DEEPL_ENDPOINT || "https://api-free.deepl.com"; // Free por defecto
const BACKFILL_LIMIT = Number(process.env.BACKFILL_LIMIT || 400);
const SLEEP_MS = Number(process.env.SLEEP_MS || 800);

if (!DEEPL_KEY) {
  console.error("❌ Falta DEEPL_API_KEY en el entorno.");
  process.exit(1);
}

const LANG_MAP = { eng:'EN', spa:'ES', fra:'FR', deu:'DE', ita:'IT', por:'PT', nld:'NL', pol:'PL', rus:'RU', jpn:'JA', zho:'ZH', bul:'BG', ces:'CS', dan:'DA', ell:'EL', est:'ET', fin:'FI', hun:'HU', lit:'LT', lav:'LV', ron:'RO', slk:'SK', slv:'SL', swe:'SV', tur:'TR', ukr:'UK' };
const toDeepL = (code3) => LANG_MAP[code3];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ensureDirFor(p){ fs.mkdirSync(path.dirname(p), { recursive: true }); }
function loadJSON(p){ return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : []; }
function saveJSON(p, data){ ensureDirFor(p); fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function detectLang2(text){
  const sample = String(text || '').slice(0, 800);
  const code3 = franc(sample, { minLength: 10 }); // 'eng', 'spa', 'und'...
  return toDeepL(code3); // puede ser undefined
}

async function deeplTranslate(text, targetLang, sourceLang){
  if (!text) return text;
  const body = new URLSearchParams();
  body.set("text", String(text).slice(0, 4000));
  body.set("target_lang", String(targetLang || 'ES').toUpperCase());
  if (sourceLang) body.set("source_lang", String(sourceLang).toUpperCase());
  try{
    const res = await fetch(`${DEEPL_ENDPOINT}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body,
    });
    if (!res.ok) {
      console.warn(`[DeepL] ${DEEPL_ENDPOINT} HTTP ${res.status}`);
      return text;
    }
    const data = await res.json();
    return data?.translations?.[0]?.text || text;
  }catch(e){
    console.warn("[DeepL]", e.message);
    return text;
  }
}

function needsTranslation(item){
  const titleSrc = (item.title_es && item.title_es.trim() !== '') ? item.title_es : (item.title || "");
  const summarySrc = (item.content_es && item.content_es.trim() !== '') ? item.content_es : (item.summary || item.description || "");

  const titleMissing   = !item.title_es || item.title_es.trim() === '';
  const titleSameAsSrc = (item.title_es || '').trim() === (item.title || '').trim();
  const contentMissing = !item.content_es || item.content_es.trim() === '';

  // Detecta idioma del material disponible; si no sabe, asumimos EN
  const lang = detectLang2(`${titleSrc} ${summarySrc}`) || 'EN';

  return (lang !== 'ES') || titleMissing || titleSameAsSrc || contentMissing;
}

async function translateItem(item){
  const title = item.title || '';
  const summarySeed = item.content_es || item.summary || item.description || '';
  const lang = (detectLang2(`${title} ${summarySeed}`) || 'EN');

  if (lang === 'ES') {
    return {
      ...item,
      title_es: (item.title_es && item.title_es.trim() !== '') ? item.title_es : title,
      content_es: (item.content_es && item.content_es.trim() !== '') ? item.content_es : (summarySeed || title),
    };
  }
  const title_es = await deeplTranslate(title, 'ES', lang);
  await sleep(SLEEP_MS);
  const content_src = summarySeed || title; // si no hay resumen, traducimos el título como contenido
  const content_es = await deeplTranslate(content_src, 'ES', lang);
  return {
    ...item,
    title_es: title_es || title,
    content_es: content_es || content_src,
  };
}

async function main(){
  const all = loadJSON(FILE);
  if (!Array.isArray(all) || all.length === 0){
    console.log("Nada que traducir (archivo vacío o no es array)");
    return;
  }

  ensureDirFor(BACKUP);
  fs.copyFileSync(FILE, BACKUP);
  console.log(`🗂  Backup creado en ${BACKUP}`);

  const toProcessIdx = [];
  for (let i=0; i<all.length; i++) {
    if (needsTranslation(all[i])) toProcessIdx.push(i);
  }
  console.log(`Encontrados ${toProcessIdx.length} artículos a traducir (faltan ES o están en inglés/idénticos).`);

  if (toProcessIdx.length === 0){
    console.log("Todo ya está traducido. ✔️");
    return;
  }

  const limit = Math.min(BACKFILL_LIMIT, toProcessIdx.length);
  console.log(`Traduciendo ${limit} artículos ahora (BACKFILL_LIMIT=${BACKFILL_LIMIT}).`);

  for (let k=0; k<limit; k++){
    const idx = toProcessIdx[k];
    const original = all[idx];
    try{
      const translated = await translateItem(original);
      // Conserva fecha/orden; SOLO actualiza campos ES
      all[idx] = {
        ...original,
        title_es: translated.title_es,
        content_es: translated.content_es,
      };
      if ((k+1) % 25 === 0) console.log(`...${k+1}/${limit} traducidos`);
    }catch(e){
      console.warn(`Error traduciendo idx=${idx}:`, e.message);
    }
    await sleep(SLEEP_MS);
  }

  saveJSON(FILE, all);
  console.log(`✔️ Guardado ${FILE} con traducciones añadidas. No se tocaron date/published.`);
}

main().catch(e=>{ console.error("Fallo en backfill-translate:", e); process.exit(1); });
