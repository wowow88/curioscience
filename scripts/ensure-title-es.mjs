// scripts/ensure-title-es.mjs
// - Solo escribe title_es si la traducción es DIFERENTE del title.
// - Fuerza EN para fuentes típicamente en inglés (detección por subcadena).
// - Fallback a MyMemory si DeepL devuelve igual o null.
// - Maneja 403/429/456 y respeta pausas/cuota.

import fs from "fs/promises";

const FINAL_JSON = process.env.FINAL_JSON || "workspace/astro/public/articles.json";
const SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || process.env.SLEEP_MS || 1200);
const MAX_TITLES = Number(process.env.TITLES_PER_RUN || 500);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "";
const isFreeKey = /:fx$/i.test(DEEPL_API_KEY) || /^fk[-_]/i.test(DEEPL_API_KEY);
const DEEPL_ENDPOINT =
  process.env.DEEPL_ENDPOINT || (isFreeKey ? "https://api-free.deepl.com" : "https://api.deepl.com");

// tokens para detectar fuentes en inglés por subcadena (lowercase)
const EN_TOKENS = [
  "nature", "science.org", "science ", "aaas", "arxiv", "pubmed",
  "sciencedaily", "phys.org", "quanta", "mit news", "nasa", "esa",
  "pnas", "plos one", "science news", "explores", "nih", "nci", "cern"
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm  = (x) => String(x || "").trim().replace(/\s+/g, " ");
const looksEnglishSource = (src = "") => EN_TOKENS.some(tok => String(src).toLowerCase().includes(tok));

async function deeplTranslate(text, sourceLang){
  if (!DEEPL_API_KEY) return { noKey:true };
  const body = new URLSearchParams({
    auth_key: DEEPL_API_KEY, text,
    target_lang: "ES", preserve_formatting: "1", split_sentences: "0"
  });
  if (sourceLang) body.set("source_lang", sourceLang);
  const res = await fetch(`${DEEPL_ENDPOINT}/v2/translate`, {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  if (res.status === 403) return { forbidden:true };
  if (res.status === 429 || res.status === 456) return { rateLimited:true };
  if (!res.ok) { console.warn(`[DeepL] HTTP ${res.status}`); return null; }
  const data = await res.json();
  const t = data?.translations?.[0]?.text;
  return t ? { text:t } : null;
}

// Fallback ligero EN→ES (gratuito)
async function fallbackMyMemoryENES(text){
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`;
  const res = await fetch(url, { headers:{ "User-Agent":"curioscience-bot/1.0" } });
  if (!res.ok) return null;
  const data = await res.json();
  const t = data?.responseData?.translatedText;
  return t && typeof t === "string" ? t : null;
}

function needsTitle(it){
  const t = norm(it.title), te = norm(it.title_es);
  if (!t) return false;
  if (!te) return true;       // falta
  return te === t;            // idéntico ⇒ volver a intentar
}

(async()=>{
  if (!DEEPL_API_KEY){
    console.error("❌ Falta DEEPL_API_KEY en Secrets.");
    process.exit(1);
  }
  console.log(`Using DeepL endpoint: ${DEEPL_ENDPOINT} (freeKey=${isFreeKey})`);

  const raw = await fs.readFile(FINAL_JSON, "utf8");
  const arr = JSON.parse(raw);
  let changed=0, attempted=0, limited=false, forbidden=false;

  for (const it of arr){
    if (attempted>=MAX_TITLES) break;
    if (!needsTitle(it)) continue;

    const title = norm(it.title);
    if (!title) continue;

    const forceEN = looksEnglishSource(it.source) ? 'EN' : undefined;
    const out = await deeplTranslate(title, forceEN);

    if (out?.forbidden){ forbidden=true; break; }
    if (out?.rateLimited){ limited=true; break; }

    let translated = out?.text;
    if (!translated || norm(translated) === title){
      if (forceEN){
        const fb = await fallbackMyMemoryENES(title);
        if (fb && norm(fb) !== title) translated = fb;
      }
    }

    if (translated && norm(translated) !== title){
      it.title_es = translated; // solo si realmente es distinta
      changed++;
    }
    attempted++;
    await sleep(SLEEP_MS);
  }

  if (changed>0){
    await fs.writeFile(FINAL_JSON, JSON.stringify(arr, null, 2), "utf8");
  }
  console.log(`ensure-title-es: traducidos ${changed}, intentos ${attempted}, rateLimited=${limited}, forbidden=${forbidden}`);
  if (forbidden){ console.error("❌ DeepL 403: clave/endpoint incorrectos (FREE → api-free.deepl.com, PRO → api.deepl.com)."); process.exit(1); }
})().catch(e=>{ console.error(e); process.exit(1); });
