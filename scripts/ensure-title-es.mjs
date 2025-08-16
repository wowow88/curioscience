// scripts/ensure-title-es.mjs
// Asegura title_es traducido en workspace/astro/public/articles.json
// - Solo escribe title_es si la traducción es DIFERENTE del title.
// - Si DeepL falla/devuelve igual, NO toca title_es (se reintenta en otro pase).
// - Fuerza EN para fuentes típicamente en inglés. Maneja 403/429/456.

import fs from "fs/promises";

const FINAL_JSON = process.env.FINAL_JSON || "workspace/astro/public/articles.json";
const SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || process.env.SLEEP_MS || 1200);
const MAX_TITLES = Number(process.env.TITLES_PER_RUN || 500);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "";
const isFreeKey = /:fx$/i.test(DEEPL_API_KEY) || /^fk[-_]/i.test(DEEPL_API_KEY);
const DEEPL_ENDPOINT =
  process.env.DEEPL_ENDPOINT || (isFreeKey ? "https://api-free.deepl.com" : "https://api.deepl.com");

const knownEnglish = new Set([
  "Nature","Science.org","Science","AAAS","arXiv","PubMed","ScienceDaily (Top)","NIH News Releases","Science News","Science News Explores","NCI (Cancer.gov)","Phys.org (Latest)","CERN News","CERN Press",
  "Quanta Magazine","MIT News","NASA (Top News)","ESA (Top News)","PNAS (Latest)","PLOS ONE","Nature News"
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deeplTranslate(text, forceEN = false) {
  if (!DEEPL_API_KEY) return { noKey: true };
  const body = new URLSearchParams({
    auth_key: DEEPL_API_KEY,
    text,
    target_lang: "ES",
    preserve_formatting: "1",
    split_sentences: "0",
  });
  if (forceEN) body.set("source_lang", "EN");

  const res = await fetch(`${DEEPL_ENDPOINT}/v2/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (res.status === 403) return { forbidden: true };
  if (res.status === 429 || res.status === 456) return { rateLimited: true };
  if (!res.ok) return null;

  const data = await res.json();
  const t = data?.translations?.[0]?.text;
  return t ? { text: t } : null;
}

function needsTranslationTitle(it) {
  const t = (it.title || "").trim();
  const te = (it.title_es || "").trim();
  if (!t) return false;
  // Traducir si falta o está idéntico al original
  if (!te || te.length === 0) return true;
  if (te === t) return true;
  return false;
}

(async () => {
  if (!DEEPL_API_KEY) {
    console.error("❌ Falta DEEPL_API_KEY en Secrets.");
    process.exit(1);
  }
  console.log(`Using DeepL endpoint: ${DEEPL_ENDPOINT} (freeKey=${isFreeKey})`);

  const raw = await fs.readFile(FINAL_JSON, "utf8");
  const arr = JSON.parse(raw);
  let changed = 0, attempted = 0, limited = false, forbidden = false;

  for (const it of arr) {
    if (attempted >= MAX_TITLES) break;
    if (!needsTranslationTitle(it)) continue;

    const title = (it.title || "").trim();
    if (!title) continue;

    const forceEN = knownEnglish.has(it.source || "");
    const out = await deeplTranslate(title, forceEN);

    if (out?.forbidden) { forbidden = true; break; }
    if (out?.rateLimited) { limited = true; break; }

    // Solo guardar si es realmente distinta
    if (out?.text && out.text !== title) {
      it.title_es = out.text;
      changed++;
    }
    attempted++;
    await sleep(SLEEP_MS);
  }

  if (changed > 0) {
    await fs.writeFile(FINAL_JSON, JSON.stringify(arr, null, 2), "utf8");
  }
  console.log(`ensure-title-es: traducidos ${changed}, intentos ${attempted}, rateLimited=${limited}, forbidden=${forbidden}`);

  if (forbidden) {
    console.error("❌ DeepL 403: revisa clave y endpoint (FREE → api-free.deepl.com, PRO → api.deepl.com).");
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
