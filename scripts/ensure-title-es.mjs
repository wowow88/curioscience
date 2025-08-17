// scripts/ensure-title-es.mjs
// - Solo escribe title_es si la traducción es DIFERENTE del title.
// - Detección flexible de fuentes en inglés por subcadenas.
// - Fallback en 429/456: LibreTranslate -> MyMemory.
// - Permite desactivar DeepL con DISABLE_DEEPL='1'.
// - Respeta pausas y límites por ejecución.
// - NO aborta el workflow en 403/456; usa fallbacks.
// - RETRY_IF_IDENTICAL: '1' para reintentar si title_es === title (por defecto '0').

import fs from "fs/promises";

const FINAL_JSON   = process.env.FINAL_JSON || "workspace/astro/public/articles.json";
const SLEEP_MS     = Number(process.env.DEEPL_SLEEP_MS || process.env.SLEEP_MS || 1200);
const MAX_TITLES   = Number(process.env.TITLES_PER_RUN || 500);

// DeepL
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "";
const isFreeKey     = /:fx$/i.test(DEEPL_API_KEY) || /^fk[-_]/i.test(DEEPL_API_KEY);
const DEEPL_ENDPOINT =
  process.env.DEEPL_ENDPOINT || (isFreeKey ? "https://api-free.deepl.com" : "https://api.deepl.com");

// Modos / fallbacks
const DISABLE_DEEPL         = process.env.DISABLE_DEEPL === "1";
const FALLBACK_ON_RATELIMIT = process.env.FALLBACK_ON_RATELIMIT === "1";
const FALLBACK_MAX          = Number(process.env.FALLBACK_MAX || 300);
const RETRY_IF_IDENTICAL    = process.env.RETRY_IF_IDENTICAL === "1"; // ⬅️ nuevo

// LibreTranslate (opcional)
const LIBRE_URL     = process.env.LIBRETRANSLATE_URL || "";          // ej: https://libretranslate.com
const LIBRE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || "";      // si tu instancia lo exige

// tokens para detectar fuentes en inglés por subcadena (lowercase)
const EN_TOKENS = [
  "nature","science.org","science ","aaas","arxiv","pubmed",
  "sciencedaily","phys.org","quanta","mit news","nasa","esa",
  "pnas","plos one","science news","explores","nih","nci","cern"
];

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const norm  = (x)=>String(x||"").trim().replace(/\s+/g," ");
const looksEnglishSource = (src="")=> EN_TOKENS.some(tok => String(src).toLowerCase().includes(tok));

// --- Traducciones ---
async function deeplTranslate(text, sourceLang){
  if (!DEEPL_API_KEY) return { noKey:true };
  const body = new URLSearchParams({
    auth_key: DEEPL_API_KEY, text,
    target_lang: "ES", preserve_formatting: "1", split_sentences: "0"
  });
  if (sourceLang) body.set("source_lang", sourceLang);
  try{
    const res = await fetch(`${DEEPL_ENDPOINT}/v2/translate`, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body
    });
    if (res.status === 403) return { forbidden:true, status:403 };
    if (res.status === 429 || res.status === 456) return { rateLimited:true, status:res.status };
    if (!res.ok) { console.warn(`[DeepL] HTTP ${res.status}`); return { bad:true, status:res.status }; }
    const data = await res.json();
    const t = data?.translations?.[0]?.text;
    return t ? { text:t } : null;
  }catch(e){
    console.warn(`[DeepL] error: ${e.message}`);
    return { bad:true };
  }
}

async function libreTranslate(text, source="en", target="es"){
  if (!LIBRE_URL) return null;
  const body = { q:text, source, target, format:"text" };
  if (LIBRE_API_KEY) body.api_key = LIBRE_API_KEY;
  try{
    const res = await fetch(`${LIBRE_URL}/translate`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.translatedText;
    return t && typeof t === "string" ? t : null;
  }catch{ return null; }
}

async function myMemoryENES(text){
  try{
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`;
    const res = await fetch(url, { headers:{ "User-Agent":"curioscience-bot/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.responseData?.translatedText;
    return t && typeof t === "string" ? t : null;
  }catch{ return null; }
}

// Decisión de “pendiente”
function needsTitle(it){
  const t = norm(it.title), te = norm(it.title_es);
  if (!t) return false;
  if (!te) return true; // falta
  if (te === t) return RETRY_IF_IDENTICAL && looksEnglishSource(it.source); // ⬅️ controlable
  return false;
}

(async()=>{
  if (!DISABLE_DEEPL && !DEEPL_API_KEY){
    console.error("❌ Falta DEEPL_API_KEY en Secrets (o usa DISABLE_DEEPL='1').");
    // No abortamos; seguimos con fallbacks si la fuente parece EN
  }
  console.log(`DeepL: ${DISABLE_DEEPL ? "DESACTIVADO (usando fallbacks)" : `endpoint ${DEEPL_ENDPOINT} (freeKey=${isFreeKey})`}`);
  if (LIBRE_URL) console.log(`LibreTranslate: ${LIBRE_URL}`);
  if (RETRY_IF_IDENTICAL) console.log("RETRY_IF_IDENTICAL=1 → se reintentan títulos idénticos en fuentes EN");

  const raw = await fs.readFile(FINAL_JSON, "utf8");
  const arr = JSON.parse(raw);

  const pendingIdx = [];
  for (let i=0;i<arr.length;i++){ if (needsTitle(arr[i])) pendingIdx.push(i); }
  console.log(`Pendientes a traducir: ${pendingIdx.length}`);
  if (pendingIdx.length === 0){ console.log('Nada que traducir.'); return; }

  let changed=0, attempted=0, limited=false, forbidden=false, fbLibre=0, fbMemory=0, rateStatus=0;

  for (const i of pendingIdx){
    if (attempted>=MAX_TITLES) break;
    const it = arr[i];
    const title = norm(it.title);
    if (!title) continue;

    const enSource = looksEnglishSource(it.source);
    let translated = null;

    if ( DISABLE_DEEPL ){
      if (enSource){
        translated = (await libreTranslate(title,'en','es')) || (await myMemoryENES(title));
        if (translated && norm(translated) === title) translated = null;
        if (translated) { if (LIBRE_URL) fbLibre++; else fbMemory++; }
      }
    } else {
      const out = await deeplTranslate(title, enSource ? 'EN' : undefined);
      if (out?.forbidden){
        // No abortamos; intentamos fallbacks si parece EN
        forbidden = true; rateStatus = out.status||0;
        if (enSource){
          translated = (await libreTranslate(title,'en','es')) || (await myMemoryENES(title));
          if (translated && norm(translated) === title) translated = null;
          if (translated) { if (LIBRE_URL) fbLibre++; else fbMemory++; }
        }
      } else if (out?.rateLimited){
        limited=true; rateStatus=out.status||0;
        if (FALLBACK_ON_RATELIMIT && enSource){
          translated = (await libreTranslate(title,'en','es')) || (await myMemoryENES(title));
          if (translated && norm(translated) === title) translated = null;
          if (translated) { if (LIBRE_URL) fbLibre++; else fbMemory++; }
        } else {
          // sin fallback: salimos del bucle para no martillear
          break;
        }
      } else {
        translated = out?.text || null;
        if (!translated || norm(translated) === title){
          if (enSource){
            translated = (await libreTranslate(title,'en','es')) || (await myMemoryENES(title));
            if (translated && norm(translated) === title) translated = null;
            if (translated) { if (LIBRE_URL) fbLibre++; else fbMemory++; }
          } else {
            translated = null;
          }
        }
      }
    }

    if (translated && norm(translated) !== title){
      it.title_es = translated;
      changed++;
    }
    attempted++;
    await sleep(SLEEP_MS);
    if ((fbLibre + fbMemory) >= FALLBACK_MAX) break;
  }

  if (changed>0){ await fs.writeFile(FINAL_JSON, JSON.stringify(arr, null, 2), "utf8"); }
  console.log(`ensure-title-es: traducidos ${changed}, intentos ${attempted}, fbLibre=${fbLibre}, fbMyMemory=${fbMemory}, rateLimited=${limited}${rateStatus?`(${rateStatus})`:""}, forbidden=${forbidden}`);
  // No hacemos process.exit(1) por 403/456: el job debe continuar.
})().catch(e=>{ console.error(e); process.exit(1); });
