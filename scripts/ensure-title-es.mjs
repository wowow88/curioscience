// scripts/ensure-title-es.mjs
// Asegura title_es traducido en workspace/astro/public/articles.json
// - Solo traduce si falta, está vacío o es idéntico al title.
// - Fuerza traducción para fuentes típicamente en inglés (Nature, Science.org, etc).
// - Respeta cuota DeepL (429/456) con pausas.

import fs from "fs/promises";

const FINAL_JSON = process.env.FINAL_JSON || "workspace/astro/public/articles.json";
const SLEEP_MS = Number(process.env.DEEPL_SLEEP_MS || process.env.SLEEP_MS || 1200);
const MAX_TITLES = Number(process.env.TITLES_PER_RUN || 500);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_ENDPOINT =
  process.env.DEEPL_ENDPOINT ||
  (DEEPL_API_KEY.startsWith("fk") ? "https://api-free.deepl.com" : "https://api.deepl.com");

const knownEnglish = new Set([
  "Nature", "Science.org", "Science", "AAAS", "arXiv",
  "PubMed", "ScienceDaily", "Phys.org", "Quanta Magazine",
  "MIT News", "NASA", "ESA"
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deeplTranslate(text, forceEN = false) {
  if (!DEEPL_API_KEY) return null;
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

  if (res.status === 429 || res.status === 456) {
    console.warn(`[DeepL] rate/quota: HTTP ${res.status}`);
    return { rateLimited: true };
  }
  if (!res.ok) {
    console.warn(`[DeepL] HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  const t = data?.translations?.[0]?.text;
  return t ? { text: t } : null;
}

function needsTranslationTitle(it) {
  const t = (it.title || "").trim();
  const te = (it.title_es || "").trim();
  if (!t) return false;                  // sin title no hay nada que hacer
  if (!te || te.length === 0) return true;
  if (te === t) return true;             // no traducido (idéntico)
  // si es fuente en inglés y sigue idéntico al original → volver a intentar
  if (knownEnglish.has(it.source || "") && te === t) return true;
  return false;
}

(async () => {
  const raw = await fs.readFile(FINAL_JSON, "utf8");
  const arr = JSON.parse(raw);
  let changed = 0, attempted = 0, limited = false;

  for (const it of arr) {
    if (attempted >= MAX_TITLES) break;
    if (!needsTranslationTitle(it)) continue;

    const title = (it.title || "").trim();
    if (!title) continue;

    const forceEN = knownEnglish.has(it.source || "");
    const out = await deeplTranslate(title, forceEN);
    if (out?.rateLimited) { limited = true; break; }
    if (out?.text && out.text !== title) {
      it.title_es = out.text;
      changed++; attempted++;
      await sleep(SLEEP_MS);
    } else {
      // si DeepL devolvió igual (propios nombres), al menos asegura el campo
      if (!it.title_es) it.title_es = title;
      attempted++;
      await sleep(150);
    }
  }

  if (changed > 0) {
    await fs.writeFile(FINAL_JSON, JSON.stringify(arr, null, 2), "utf8");
  }
  console.log(`ensure-title-es: traducidos ${changed}, intentos ${attempted}, rateLimited=${limited}`);
})();
