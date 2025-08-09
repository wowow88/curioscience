import json
import requests
import feedparser
from bs4 import BeautifulSoup
from datetime import datetime
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client
import time
from requests.exceptions import ConnectionError
import os
from glob import glob

# Rutas
DAILY_DIR = "workspace/astro/data/articles_daily"
FINAL_PATH = "workspace/astro/public/articles_py.json"
BACKUP_DIR = "workspace/astro/backups"
SPANISH_SOURCES = ["AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC"]

def backup_previous_version():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    if os.path.exists(FINAL_PATH):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"articles_py_{timestamp}.json")
        with open(FINAL_PATH, "rb") as src, open(backup_path, "wb") as dst:
            dst.write(src.read())
        print(f"🗂 Copia de seguridad creada en {backup_path}")

def fetch_arxiv():
    client = Client()
    search = Search(query="cat:cs.AI", max_results=2, sort_by=SortCriterion.SubmittedDate)
    try:
        results = client.results(search)
        return [{
            "title": r.title,
            "url": r.entry_id,
            "date": r.published.date().isoformat(),
            "source": "arXiv",
            "summary": r.summary
        } for r in results]
    except ConnectionError as e:
        print("Error al conectar con arXiv:", e)
        return []

def fetch_rss(source_name, url):
    articles = []
    feed = feedparser.parse(url)
    for entry in feed.entries[:1]:
        try:
            date = datetime(*entry.published_parsed[:6]).date().isoformat()
        except AttributeError:
            date = datetime.now().date().isoformat()
        article = {
            "title": entry.title,
            "url": entry.link,
            "date": date,
            "source": source_name,
            "summary": BeautifulSoup(entry.get("summary", ""), "html.parser").get_text()
        }
        articles.append(article)
    return articles

def translate_article(article):
    if article["source"] in ["arXiv", "Science.org", "Nature"]:
        translator = GoogleTranslator(source='auto', target='es')
        return {
            "title": article["title"],
            "title_es": translator.translate(article["title"]),
            "url": article["url"],
            "date": article["date"],
            "source": article["source"],
            "content_es": translator.translate(article.get("summary", ""))
        }
    elif article["source"] in SPANISH_SOURCES:
        return {
            "title": article["title"],
            "title_es": article["title"],
            "url": article["url"],
            "date": article["date"],
            "source": article["source"],
            "content_es": ""
        }
    else:
        return {
            "title": article["title"],
            "title_es": article["title"],
            "url": article["url"],
            "date": article["date"],
            "source": article["source"],
            "content_es": article.get("summary", "")
        }

def main():
    backup_previous_version()
    os.makedirs(DAILY_DIR, exist_ok=True)

    all_articles = []
    for attempt in range(3):
        try:
            all_articles += fetch_arxiv()
            break
        except Exception as e:
            print(f"Reintento {attempt + 1}/3 fallido con arXiv: {e}")
            time.sleep(5)

    sources = {
        "Science.org": "https://www.science.org/rss/news_current.xml",
        "Nature": "https://www.nature.com/nature/articles?type=news&format=rss",
        "AEMET": "https://www.aemet.es/xml/boletin.rss",
        "CNIC": "https://www.cnic.es/es/rss.xml",
        "CNIO": "https://www.cnio.es/feed/",
        "ISCIII": "https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1",
        "IEO": "https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss",
        "IAC": "https://www.iac.es/en/rss.xml"
    }

    for name, url in sources.items():
        try:
            all_articles += fetch_rss(name, url)
        except Exception as e:
            print(f"[{name}] Error al procesar feed: {e}")

    # Guardar archivo del día
    today_str = datetime.now().strftime("%Y-%m-%d")
    daily_path = os.path.join(DAILY_DIR, f"{today_str}.json")
    translated = [translate_article(a) for a in all_articles]
    with open(daily_path, "w", encoding="utf-8") as f:
        json.dump(translated, f, ensure_ascii=False, indent=2)

    # Leer artículos existentes (si existen)
    existing_articles = []
    if os.path.exists(FINAL_PATH):
        with open(FINAL_PATH, "r", encoding="utf-8") as f:
            existing_articles = json.load(f)

    existing_urls = {a["url"] for a in existing_articles}
    new_articles = [a for a in translated if a["url"] not in existing_urls]

    all_articles = existing_articles + new_articles
    all_articles.sort(key=lambda x: x["date"], reverse=True)

    with open(FINAL_PATH, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)

    # ... (tu código igual)
    print(f"✅ Guardados {len(all_articles)} artículos únicos en {FINAL_PATH}")

    if __name__ == "__main__":
    main()



