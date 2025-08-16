# data_pipeline.py — Modo secuencial 1-por-fuente
# Genera workspace/astro/public/articles_py.json tomando 1 artículo por fuente en orden.
# Traduce con GoogleTranslator salvo fuentes ES.

import json, os, time
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

import feedparser
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client

FINAL_PATH = "workspace/astro/public/articles_py.json"
BACKUP_DIR = "workspace/astro/backups"
SPANISH_SOURCES = {"AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC"}

SOURCES = [
    ("arXiv",       "arxiv"),  # manejado aparte
    ("Science.org", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science"),
    ("Nature",      "https://www.nature.com/nature.rss"),
    ("AEMET",       "https://www.aemet.es/xml/boletin.rss"),
    ("CNIC",        "https://www.cnic.es/es/rss.xml"),
    ("CNIO",        "https://www.cnio.es/feed/"),
    ("ISCIII",      "https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1"),
    ("IEO",         "https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss"),
    ("IAC",         "https://www.iac.es/en/rss.xml"),
]


def backup_previous_version():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    if os.path.exists(FINAL_PATH):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(FINAL_PATH, "rb") as src, open(os.path.join(BACKUP_DIR, f"articles_py_{ts}.json"), "wb") as dst:
            dst.write(src.read())


def norm_url(u: str) -> str:
    if not u: return ""
    s = str(u).strip()
    try:
        parts = urlsplit(s)
        clean = parts._replace(query="", fragment="", netloc=parts.netloc.lower(), scheme=(parts.scheme or "https").lower())
        return urlunsplit(clean)
    except Exception:
        return s.split("#")[0].split("?")[0].strip().lower()


def clean_text(html: str) -> str:
    if not html: return ""
    return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)


def to_iso_date(entry) -> str:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, key, None)
        if val:
            try:
                return datetime(*val[:6]).date().isoformat()
            except Exception:
                pass
    for key in ("published", "updated", "created", "dc_date"):
        val = getattr(entry, key, None) or (isinstance(entry, dict) and entry.get(key))
        if val:
            try:
                ts = feedparser._parse_date(val)
                if ts:
                    return datetime(*ts[:6]).date().isoformat()
            except Exception:
                pass
    return ""


def translate_text(txt: str) -> str:
    if not txt: return ""
    try:
        return GoogleTranslator(source="auto", target="es").translate(txt)
    except Exception:
        return txt


def make_article(title, url, date, source, summary) -> dict:
    title = (title or "").strip()
    url = norm_url(url)
    date = (date or "").strip()
    source = (source or "").strip()
    summary_txt = clean_text(summary or "")
    content_seed = summary_txt or title

    if source in SPANISH_SOURCES:
        title_es = title
        content_es = content_seed
    else:
        title_es = translate_text(title)
        content_es = translate_text(content_seed)

    return {
        "title": title,
        "title_es": title_es or title,
        "url": url,
        "date": date,  # YYYY-MM-DD o ''
        "source": source,
        "content_es": content_es or content_seed,
    }


def fetch_one_arxiv():
    try:
        client = Client()
        search = Search(query="cat:cs.AI", max_results=1, sort_by=SortCriterion.SubmittedDate)
        for r in client.results(search):
            return make_article(
                title=r.title,
                url=r.entry_id,
                date=r.published.date().isoformat() if getattr(r, "published", None) else "",
                source="arXiv",
                summary=r.summary,
            )
    except Exception as e:
        print("[arXiv]", e)
    return None


def fetch_one_rss(name: str, url: str):
    try:
        feed = feedparser.parse(url)
        items = getattr(feed, "entries", [])
        # ordenamos por fecha desc y tomamos el primero válido
        def ts(e):
            d = to_iso_date(e)
            try:
                return datetime.fromisoformat(d) if d else datetime.min
            except Exception:
                return datetime.min
        items = sorted(items, key=lambda e: ts(e), reverse=True)
        for entry in items:
            title = getattr(entry, "title", "")
            link = getattr(entry, "link", "")
            date = to_iso_date(entry)
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
            if link and title:
                return make_article(title, link, date, name, summary)
    except Exception as e:
        print(f"[{name}] RSS error: {e}")
    return None


def main():
    backup_previous_version()

    picked = []
    seen = set()

    # 1) arXiv (1 artículo)
    art = fetch_one_arxiv()
    if art and art["url"] and art["url"] not in seen:
        picked.append(art); seen.add(art["url"]) ; print("[arXiv] tomado 1")
    else:
        print("[arXiv] ninguno")

    # 2) resto de fuentes (1 por cada una)
    for name, url in SOURCES:
        if name == "arXiv":
            continue
        art = fetch_one_rss(name, url)
        if art and art["url"] and art["url"] not in seen:
            picked.append(art); seen.add(art["url"]) ; print(f"[{name}] tomado 1")
        else:
            print(f"[{name}] ninguno")

    # 3) Merge con histórico: nunca borrar, solo añadir/actualizar por URL
    existing = []
    if os.path.exists(FINAL_PATH):
        try:
            with open(FINAL_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = []

    by_url = { norm_url(a.get("url","")): a for a in existing if a.get("url") }
    for a in picked:
        k = norm_url(a.get("url",""))
        if not k: continue
        prev = by_url.get(k, {})
        # No pisamos con vacíos
        merged = {
            **prev,
            **{k2: v for k2, v in a.items() if isinstance(v, str) and v.strip() != ""}
        }
        by_url[k] = merged

    out = list(by_url.values())
    # Orden por date desc si existe
    def t(it):
        d = it.get("date") or it.get("published") or ""
        try: return datetime.fromisoformat(d).timestamp()
        except Exception:
            try: return datetime.fromisoformat(d[:10]).timestamp()
            except Exception: return 0
    out.sort(key=t, reverse=True)

    os.makedirs(os.path.dirname(FINAL_PATH), exist_ok=True)
    with open(FINAL_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ PY: añadidos {len(picked)} | total {len(out)} → {FINAL_PATH}")


if __name__ == "__main__":
    main()
