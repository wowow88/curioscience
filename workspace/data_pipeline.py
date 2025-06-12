import json
import requests
import feedparser
from bs4 import BeautifulSoup
from datetime import datetime
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion, Client
import time
from requests.exceptions import ConnectionError

def fetch_arxiv():
    client = Client()
    search = Search(query="cat:cs.AI", max_results=10, sort_by=SortCriterion.SubmittedDate)
    try:
        results = client.results(search)
        articles = []
        for result in results:
            articles.append({
                "title": result.title,
                "url": result.entry_id,
                "date": result.published.date().isoformat(),
                "source": "arXiv",
                "summary": result.summary
            })
        print("Fetched from arXiv:", len(articles))
        return articles
    except ConnectionError as e:
        print("Error al conectar con arXiv:", e)
        return []


def fetch_rss(source_name, url):
    articles = []
    feed = feedparser.parse(url)
    for entry in feed.entries[:5]:
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
    print(f"Fetched from {source_name} RSS:", len(articles))
    return articles
# ... [importaciones] ...
spanish_sources = ["AEMET", "CNIC", "CNIO", "ISCIII", "IEO", "IAC"]

def translate_article(article):
    # Traducción solo para fuentes internacionales
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
    elif article["source"] in spanish_sources:
        return {
            "title": article["title"],
            "title_es": article["title"],  # no se traduce
            "url": article["url"],
            "date": article["date"],
            "source": article["source"],
            "content_es": ""  # sin resumen
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
    all_articles = []

    # Recolectar fuentes
    all_articles += fetch_arxiv()
    all_articles += fetch_rss("Science.org", "https://www.science.org/rss/news_current.xml")
    all_articles += fetch_rss("Nature", "https://www.nature.com/nature/articles?type=news&format=rss")
    all_articles += fetch_rss("AEMET", "https://www.aemet.es/xml/boletin.rss")
    all_articles += fetch_rss("CNIC", "https://www.cnic.es/es/rss.xml")
    all_articles += fetch_rss("CNIO", "https://www.cnio.es/feed/")
    all_articles += fetch_rss("ISCIII", "https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1")
    all_articles += fetch_rss("IEO", "https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss")
    all_articles += fetch_rss("IAC", "https://www.iac.es/en/rss.xml")

    # Eliminar duplicados (por URL)
    unique_articles = {}
    for article in all_articles:
        if article["url"] not in unique_articles:
            unique_articles[article["url"]] = article

    translated_articles = [translate_article(article) for article in unique_articles.values()]

    with open("workspace/astro/public/articles.json", "w", encoding="utf-8") as f:
        json.dump(translated_articles, f, ensure_ascii=False, indent=2)
    print("Guardados", len(translated_articles), "artículos en articles.json")

if __name__ == "__main__":
    main()


