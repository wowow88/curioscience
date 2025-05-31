import os
import json
import requests
import feedparser
import datetime
from arxiv import Search, SortCriterion
from deep_translator import DeeplTranslator

DEEPL_API_KEY = os.getenv('DEEPL_API_KEY')

def translate(text, target_lang='ES'):
    if not text.strip():
        return ""
    try:
        translated = DeeplTranslator(api_key=DEEPL_API_KEY, source="EN", target=target_lang).translate(text)
        return translated
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def fetch_arxiv():
    results = Search(
        query="science OR technology",
        max_results=10,
        sort_by=SortCriterion.SubmittedDate
    )
    articles = []
    for result in results.results():
        articles.append({
            "title": result.title,
            "url": result.entry_id,
            "date": result.updated.date().isoformat(),
            "source": "arXiv",
            "summary": result.summary
        })
    print(f"Fetched {len(articles)} from arXiv")
    return articles

def fetch_pubmed():
    try:
        base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        params = {
            "db": "pubmed",
            "term": "science AND 2025[PDAT]",
            "retmode": "json",
            "retmax": 5
        }
        ids = requests.get(base, params=params).json()["esearchresult"]["idlist"]
        fetch_base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        summaries = requests.get(fetch_base, params={
            "db": "pubmed",
            "id": ",".join(ids),
            "retmode": "json"
        }).json()["result"]
        articles = []
        for uid in ids:
            item = summaries[uid]
            articles.append({
                "title": item["title"],
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                "date": datetime.datetime.today().date().isoformat(),
                "source": "PubMed",
                "summary": ""
            })
        print(f"Fetched {len(articles)} from PubMed")
        return articles
    except Exception as e:
        print(f"Error fetching from PubMed: {e}")
        return []

def fetch_rss(url, source, max_items=5):
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:max_items]:
            items.append({
                "title": entry.title,
                "url": entry.link,
                "date": datetime.datetime(*entry.published_parsed[:3]).isoformat() if entry.get("published_parsed") else datetime.datetime.today().date().isoformat(),
                "source": source,
                "summary": entry.get("summary", "")
            })
        print(f"Fetched {len(items)} from {source} RSS")
        return items
    except Exception as e:
        print(f"Error fetching from {source} RSS: {e}")
        return []

def main():
    articles = []
    articles += fetch_arxiv()
    articles += fetch_pubmed()
    articles += fetch_rss("https://www.sciencemag.org/rss/news_current.xml", "Science.org")
    articles += fetch_rss("https://www.nature.com/nature.rss", "Nature")

    latest = sorted(articles, key=lambda x: x["date"], reverse=True)[:10]
    translated = []
    for a in latest:
        a["title_es"] = translate(a["title"], "ES")
        a["content_es"] = translate(a.get("summary", ""), "ES")
        translated.append(a)

    out_path = "workspace/astro/public/articles.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(translated, f, ensure_ascii=False, indent=2)
    print(f"Artículos actualizados: {len(translated)}\nSaved to {out_path}")

if __name__ == "__main__":
    main()
