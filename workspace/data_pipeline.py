import json, os, time
from datetime import datetime
from urllib.parse import urlsplit

import feedparser
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client
import requests

FINAL_PATH = "workspace/astro/public/articles_py.json"
BACKUP_DIR = "workspace/astro/backups"
SPANISH_SOURCES = {"AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC", "Agencia SINC - Ciencia"}

# -----------------------------
# Funciones para nuevas fuentes
# -----------------------------
def fetch_doaj():
    url = "https://doaj.org/api/v2/search/articles?q=science&page=1&pageSize=1"
    r = requests.get(url)
    if r.ok:
        data = r.json()
        if data.get("results"):
            item = data["results"][0]["bibjson"]
            return {
                "title": item.get("title"),
                "url": item.get("link", [{}])[0].get("url", ""),
                "source": "DOAJ",
                "date": datetime.utcnow().isoformat(),
            }
    return None

def fetch_core():
    url = "https://core.ac.uk:443/api-v2/search/articles?q=science&page=1&pageSize=1"
    r = requests.get(url)
    if r.ok:
        data = r.json()
        if data.get("data"):
            item = data["data"][0]
            return {
                "title": item.get("title"),
                "url": item.get("url"),
                "source": "CORE",
                "date": datetime.utcnow().isoformat(),
            }
    return None

def fetch_oa_mg():
    url = "https://api.oa.mg/v1/papers/search?q=science&limit=1"
    r = requests.get(url)
    if r.ok:
        data = r.json()
        if data:
            item = data[0]
            return {
                "title": item.get("title"),
                "url": item.get("externalIds", {}).get("DOI", ""),
                "source": "OA.mg",
                "date": datetime.utcnow().isoformat(),
            }
    return None

# ----------------------
# Fuente arXiv ya usada
# ----------------------
def fetch_arxiv():
    client = Client()
    search = Search(query="science", max_results=1, sort_by=SortCriterion.SubmittedDate)
    for result in client.results(search):
        return {
            "title": result.title,
            "url": result.entry_id,
            "source": "arXiv",
            "date": result.updated.isoformat(),
        }

# ----------------------
# RSS Feed sources
# ----------------------
def fetch_rss(name, url):
    d = feedparser.parse(url)
    if d.entries:
        entry = d.entries[0]
        return {
            "title": entry.title,
            "url": entry.link,
            "source": name,
            "date": entry.get("published", datetime.utcnow().isoformat()),
        }
    return None

# ----------------------
# HTML fallback sources
# ----------------------
def fetch_html_fallback(name, url):
    try:
        r = requests.get(url)
        if r.ok:
            soup = BeautifulSoup(r.text, "html.parser")
            if name == "ISCIII":
                item = soup.select_one(".noticia h3")
                link = soup.select_one(".noticia a")
                return {
                    "title": item.text.strip(),
                    "url": link.get("href", ""),
                    "source": name,
                    "date": datetime.utcnow().isoformat(),
                }
            elif name == "IEO":
                item = soup.select_one(".bloque-noticia h3")
                link = soup.select_one(".bloque-noticia a")
                return {
                    "title": item.text.strip(),
                    "url": link.get("href", ""),
                    "source": name,
                    "date": datetime.utcnow().isoformat(),
                }
    except Exception as e:
        print(f"❌ Error HTML fallback {name}: {e}")
    return None

# ----------------------------
# Lista total de fuentes
# ----------------------------
SOURCES = [
    ("arXiv", fetch_arxiv),
    ("DOAJ", fetch_doaj),
    ("CORE", fetch_core),
    ("OA.mg", fetch_oa_mg),
    ("Science.org", lambda: fetch_rss("Science.org", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science")),
    ("Nature", lambda: fetch_rss("Nature", "https://www.nature.com/nature.rss")),
    ("NASA", lambda: fetch_rss("NASA", "https://www.nasa.gov/rss/dyn/breaking_news.rss")),
    ("ESA", lambda: fetch_rss("ESA", "https://www.esa.int/rssfeed/topnews")),
    ("AEMET", lambda: fetch_rss("AEMET", "https://www.aemet.es/es/rss_info/avisos/esp")),
    ("CNIC", lambda: fetch_rss("CNIC", "https://www.cnic.es/es/rss.xml")),
    ("CNIO", lambda: fetch_rss("CNIO", "https://www.cnio.es/feed/")),
    ("IAC", lambda: fetch_rss("IAC", "https://www.iac.es/es/feed_news")),
    ("Agencia SINC - Ciencia", lambda: fetch_rss("Agencia SINC - Ciencia", "https://www.agenciasinc.es/feed/rss/Ciencia")),
    ("ISCIII", lambda: fetch_html_fallback("ISCIII", "https://www.isciii.es/actualidad")),
    ("IEO", lambda: fetch_html_fallback("IEO", "https://www.ieo.es/es_ES/web/ieo/actualidad")),
]

# ----------------------------
# Recolección de artículos
# ----------------------------
all_articles = []

for name, fetch_func in SOURCES:
    try:
        article = fetch_func()
        if article:
            if name not in SPANISH_SOURCES:
                article["title_es"] = GoogleTranslator(source='auto', target='es').translate(article["title"])
            all_articles.append(article)
    except Exception as e:
        print(f"⚠️ Error en fuente {name}: {e}")

# Guardar en JSON final
os.makedirs(os.path.dirname(FINAL_PATH), exist_ok=True)
with open(FINAL_PATH, "w", encoding="utf-8") as f:
    json.dump(all_articles, f, ensure_ascii=False, indent=2)

print(f"✅ Artículos guardados en {FINAL_PATH}")
