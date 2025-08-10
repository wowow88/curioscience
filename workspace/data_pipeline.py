# data_pipeline.py
# - Obtiene arXiv + varios RSS y genera workspace/astro/public/articles_py.json
# - Normaliza URL (sin query/hash) para deduplicar con histórico
# - NO inventa fechas: si el feed no trae fecha, la deja vacía
# - Traduce con deep_translator.GoogleTranslator (auto->es) con fallback si falla
# - Conserva histórico: nunca borra entradas anteriores; añade las nuevas
# - Esquema de salida alineado con la web: title, title_es, url, date (YYYY-MM-DD), source, content_es

import json
import os
import time
from datetime import datetime
from glob import glob
from urllib.parse import urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client
from requests.exceptions import ConnectionError

# Rutas
DAILY_DIR   = "workspace/astro/data/articles_daily"
FINAL_PATH  = "workspace/astro/public/articles_py.json"
BACKUP_DIR  = "workspace/astro/backups"

# Fuentes en español (no traducimos)
SPANISH_SOURCES = {"AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC"}

# ------------ Utilidades ------------

def backup_previous_version():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    if os.path.exists(FINAL_PATH):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"articles_py_{timestamp}.json")
        with open(FINAL_PATH, "rb") as src, open(backup_path, "wb") as dst:
            dst.write(src.read())
        print(f"🗂 Copia de seguridad creada en {backup_path}")

def norm_url(u: str) -> str:
    """Normaliza la URL eliminando query y fragment; minúsculas en esquema/host."""
    if not u:
        return ""
    s = str(u).strip()
    try:
        parts = urlsplit(s)
        clean = parts._replace(query="", fragment="", netloc=parts.netloc.lower(), scheme=(parts.scheme or "https").lower())
        return urlunsplit(clean)
    except Exception:
        # Fallback: quita ? y # burdamente
        return s.split("#")[0].split("?")[0].strip().lower()

def clean_text(html: str) -> str:
    if not html:
        return ""
    return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)

def to_iso_date(date_like) -> str:
    """Devuelve YYYY-MM-DD (ISO corto) si se puede parsear; si no, ''."""
    try:
        if not date_like:
            return ""
        # feedparser suele dar *_parsed tipo time.struct_time
        if hasattr(date_like, "tm_year"):
            dt = datetime(*date_like[:6])
            return dt.date().isoformat()
        # strings: intentar con datetime.fromisoformat o dateutil si existiera
        ts = feedparser._parse_date(date_like)  # usa parser interno si puede
        if ts:
            return datetime(*ts[:6]).date().isoformat()
    except Exception:
        pass
    return ""

def choose_date(entry) -> str:
    """Elige la mejor fecha disponible del item del feed; si no hay, ''."""
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        if getattr(entry, key, None):
            d = to_iso_date(getattr(entry, key))
            if d:
                return d
    for key in ("published", "updated", "created", "dc_date"):
        if entry.get(key):
            d = to_iso_date(entry.get(key))
            if d:
                return d
    return ""  # 👈 nunca inventamos "hoy"

def translate_text(txt: str) -> str:
    if not txt:
        return ""
    try:
        return GoogleTranslator(source="auto", target="es").translate(txt)
    except Exception as e:
        # No rompemos el pipeline si GoogleTranslator falla
        return txt

def make_article(title, url, date, source, summary) -> dict:
    """Crea objeto artículo con campos obligatorios del sitio."""
    title = (title or "").strip()
    url = norm_url(url)
    date = (date or "").strip()
    source = (source or "").strip()
    summary_txt = clean_text(summary or "")
    content_seed = summary_txt or title  # 👈 si no hay snippet, usamos el título

    if source in SPANISH_SOURCES:
        title_es = title
        content_es = content_seed
    else:
        # Traducción tolerante a fallos
        title_es = translate_text(title)
        content_es = translate_text(content_seed)

    return {
        "title": title,
        "title_es": title_es or title,
        "url": url,
        "date": date,                  # YYYY-MM-DD o ''
        "source": source,
        "content_es": content_es or content_seed
    }

# ------------ Fetchers ------------

def fetch_arxiv(max_results: int = 20):
    client = Client()
    search = Search(query="cat:cs.AI", max_results=max_results, sort_by=SortCriterion.SubmittedDate)
    out = []
    try:
        for r in client.results(search):
            out.append(make_article(
                title=r.title,
                url=r.entry_id,
                date=r.published.date().isoformat() if getattr(r, "published", None) else "",
                source="arXiv",
                summary=r.summary
            ))
    except ConnectionError as e:
        print("Error al conectar con arXiv:", e)
    except Exception as e:
        print("Error inesperado en arXiv:", e)
    return out

def fetch_rss(source_name: str, url: str, limit: int = 20):
    feed = feedparser.parse(url)
    items = []
    for entry in (feed.entries or [])[:limit]:
        try:
            date = choose_date(entry)
            items.append(make_article(
                title=entry.get("title", ""),
                url=entry.get("link", ""),
                date=date,
                source=source_name,
                summary=entry.get("summary", "") or entry.get("description", "")
            ))
        except Exception as e:
            print(f"[{source_name}] Error en item RSS: {e}")
    return items

# ------------ Main ------------

def main():
    backup_previous_version()
    os.makedirs(DAILY_DIR, exist_ok=True)

    collected = []

    # arXiv con reintentos
    for attempt in range(3):
        try:
            collected += fetch_arxiv(max_results=20)
            break
        except Exception as e:
            print(f"Reintento {attempt+1}/3 fallido con arXiv: {e}")
            time.sleep(5)

    sources = {
        "Science.org": "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
        "Nature":      "https://www.nature.com/nature.rss",
        "AEMET":       "https://www.aemet.es/xml/boletin.rss",
        "CNIC":        "https://www.cnic.es/es/rss.xml",
        "CNIO":        "https://www.cnio.es/feed/",
        "ISCIII":      "https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1",
        "IEO":         "https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss",
        "IAC":         "https://www.iac.es/en/rss.xml",
    }

    for name, url in sources.items():
        try:
            collected += fetch_rss(name, url, limit=30)
        except Exception as e:
            print(f"[{name}] Error al procesar feed: {e}")

    # Guardar archivo del día (lo traducido de hoy)
    today_str = datetime.now().strftime("%Y-%m-%d")
    daily_path = os.path.join(DAILY_DIR, f"{today_str}.json")
    os.makedirs(os.path.dirname(daily_path), exist_ok=True)
    with open(daily_path, "w", encoding="utf-8") as f:
        json.dump(collected, f, ensure_ascii=False, indent=2)

    # Leer histórico existente (si lo hay)
    existing = []
    if os.path.exists(FINAL_PATH):
        with open(FINAL_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)

    # Deduplicar por URL normalizada (no perder histórico)
    by_url = {}

    # Cargar histórico primero (gana siempre si el nuevo trae campos vacíos)
    for a in existing:
        key = norm_url(a.get("url", ""))
        if not key:
            continue
        by_url[key] = {
            "title": a.get("title", "").strip(),
            "title_es": (a.get("title_es") or a.get("title") or "").strip(),
            "url": key,
            "date": (a.get("date") or "").strip(),
            "source": a.get("source", "").strip(),
            "content_es": (a.get("content_es") or a.get("summary") or a.get("description") or a.get("title") or "").strip(),
        }

    # Incorporar nuevos (solo rellenar si traen valor no vacío)
    for a in collected:
        key = norm_url(a.get("url", ""))
        if not key:
            continue
        prev = by_url.get(key, {})
        merged = {
            "title": a["title"] or prev.get("title", ""),
            "title_es": (a.get("title_es") or prev.get("title_es") or a["title"] or "").strip(),
            "url": key,
            # fecha: conservar histórica si ya existe
            "date": (prev.get("date") or a.get("date") or "").strip(),
            "source": (a.get("source") or prev.get("source") or "").strip(),
            # content_es: no pisar con vacío
            "content_es": (a.get("content_es") or prev.get("content_es") or a.get("summary") or a.get("title") or "").strip(),
        }
        by_url[key] = merged

    all_articles = list(by_url.values())

    # Orden por fecha descendente (las sin fecha al final)
    def key_time(it):
        try:
            return datetime.fromisoformat(it.get("date", "") or "1970-01-01")
        except Exception:
            return datetime(1970, 1, 1)

    all_articles.sort(key=key_time, reverse=True)

    # Escribir archivo final
    os.makedirs(os.path.dirname(FINAL_PATH), exist_ok=True)
    with open(FINAL_PATH, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)

    print(f"✅ Guardados {len(all_articles)} artículos únicos en {FINAL_PATH}")

if __name__ == "__main__":
    main()


