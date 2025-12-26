# data_pipeline.py — Modo secuencial 1-por-fuente (actualizado con nuevas fuentes y fallbacks)
# Genera workspace/astro/public/articles_py.json tomando 1 artículo por fuente en orden.
# Traduce con GoogleTranslator salvo fuentes ES. Fallback HTML (requests+BS4) para ISCIII/IEO.

import json, os, time
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

import feedparser
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client
import requests

FINAL_PATH = "workspace/astro/public/articles_py.json"
BACKUP_DIR = "workspace/astro/backups"
SPANISH_SOURCES = {"AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC", "Agencia SINC - Ciencia"}

SOURCES = [
("arXiv", "arxiv"),
("Science.org", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science"),
("Nature", "https://www.nature.com/nature.rss"),
("AEMET", "https://www.aemet.es/es/rss_info/avisos/esp"),
("CNIC", "https://www.cnic.es/es/rss.xml"),
("CNIO", "https://www.cnio.es/feed/"),
("ISCIII", "HTML_FALLBACK:https://www.isciii.es/actualidad"),
("IEO", "HTML_FALLBACK:https://www.ieo.es/es_ES/web/ieo/actualidad"),
("IAC", "https://www.iac.es/es/feed_news"),
("NASA (Top News)", "https://www.nasa.gov/rss/dyn/breaking_news.rss"),
("ESA (Top News)", "https://www.esa.int/rssfeed/topnews"),
("CERN News", "https://home.cern/api/news/news/feed.rss"),
("CERN Press", "https://home.cern/api/news/press-release/feed.rss"),
("NIH News Releases", "https://www.nih.gov/news-events/news-releases/rss.xml"),
("NCI (Cancer.gov)", "https://www.cancer.gov/rss/news"),
("Science News", "https://www.sciencenews.org/feed"),
("Science News Explores", "https://www.snexplores.org/feed"),
("ScienceDaily (Top)", "https://www.sciencedaily.com/rss/top/science.xml"),
("Phys.org (Latest)", "https://phys.org/rss-feed/"),
("PNAS (Latest)", "https://www.pnas.org/rss/latest"),
("PLOS ONE", "https://journals.plos.org/plosone/feed/atom"),
("Nature News", "https://www.nature.com/nature/articles?type=news&format=rss"),
("Agencia SINC - Ciencia", "https://www.agenciasinc.es/rss/ciencia"),
("DOAJ", "API_DOAJ"),
("CORE", "API_CORE"),
("OA.mg", "API_OAMG"),
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


def make_article(title, url, date, source) -> dict:
    title = (title or "").strip()
    url = norm_url(url)
    date = (date or "").strip()
    source = (source or "").strip()

    if source in SPANISH_SOURCES:
        title_es = title

    else:
        title_es = translate_text(title)
        
    return {
        "title": title,
        "title_es": title_es or title,
        "url": url,
        "date": date,  # YYYY-MM-DD o ''
        "source": source,
    }


# ——— RSS y HTML fallbacks ———

def fetch_one_html(name: str, url: str):
    try:
        headers = {"User-Agent": "FuturoCientificoBot/1.0"}
        r = requests.get(url, headers=headers, timeout=12)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        # estrategia genérica: primer enlace con texto decente
        for a in soup.find_all('a', href=True):
            title = (a.get_text() or "").strip()
            if len(title) >= 10:
                href = a['href']
                abs_url = requests.compat.urljoin(url, href)
                return make_article(title, abs_url, "", name, title)
    except Exception as e:
        print(f"[{name}] HTML fallback error: {e}")
    return None


def fetch_one_rss(name: str, url: str):
    try:
        feed = feedparser.parse(url)
        items = getattr(feed, "entries", [])
        # orden por fecha desc y tomo el primero válido
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
            if link and title:
                return make_article(title, link, date, name)
    except Exception as e:
        print(f"[{name}] RSS error: {e}")
    return None


def fetch_one(name: str, url: str):
    if url.startswith("HTML_FALLBACK:"):
        return fetch_one_html(name, url.replace("HTML_FALLBACK:", ""))
    return fetch_one_rss(name, url)


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
            )
    except Exception as e:
        print("[arXiv]", e)
    return None


def main():
    # backup y merge incremental
    os.makedirs(os.path.dirname(FINAL_PATH), exist_ok=True)
    backup_previous_version()

    picked = []
    seen = set()

    # 1) arXiv (1)
    art = fetch_one_arxiv()
    if art and art["url"] and art["url"] not in seen:
        picked.append(art); seen.add(art["url"]) ; print("[arXiv] tomado 1")
    else:
        print("[arXiv] ninguno")

    # 2) resto (1 por fuente)
    for name, url in SOURCES:
        if name == "arXiv":
            continue
        art = fetch_one(name, url)
        if art and art["url"]:
            key = norm_url(art["url"]) or art["url"]
            if key in seen:
                print(f"[{name}] duplicado, salto")
                continue
            picked.append(art); seen.add(key); print(f"[{name}] tomado 1")
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
        merged = { **prev, **{k2: v for k2, v in a.items() if isinstance(v, str) and v.strip() != ""} }
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

    with open(FINAL_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ PY: añadidos {len(picked)} | total {len(out)} → {FINAL_PATH}")


if __name__ == "__main__":
    main()

