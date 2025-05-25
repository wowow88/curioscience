import os
import json
import requests
from datetime import datetime
from typing import List, Dict
import arxiv
import feedparser
from deepl import Translator

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY")
translator = Translator(DEEPL_API_KEY)
OUTPUT_FILE = "workspace/data/articles.json"
ARTICLES_PER_DAY = 5
RSS_FEEDS = [
    "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
    "https://www.nature.com/nature.rss"
]

def fetch_arxiv_articles() -> List[Dict]:
    print("📥 Fetching articles from arXiv...")
    search = arxiv.Search(query="cat:physics OR cat:cs.AI", max_results=5, sort_by=arxiv.SortCriterion.SubmittedDate)
    return [{
        "title": result.title,
        "content": result.summary,
        "date": result.published.strftime("%Y-%m-%d"),
        "category": result.primary_category,
        "tags": result.categories,
        "source_url": result.entry_id
    } for result in arxiv.Client().results(search)]

def fetch_pubmed_articles() -> List[Dict]:
    print("📥 Fetching articles from PubMed...")
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    params = {"db": "pubmed", "term": "science[Title]", "retmode": "json", "retmax": 5}
    ids = requests.get(url, params=params).json()["esearchresult"]["idlist"]
    if not ids:
        return []
    summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    summaries = requests.get(summary_url, params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"}).json()["result"]
    return [{
        "title": summaries[id]["title"],
        "content": summaries[id].get("source", ""),
        "date": summaries[id].get("pubdate", ""),
        "category": "medicine",
        "tags": ["pubmed"],
        "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{id}/"
    } for id in ids if id in summaries]

def fetch_rss_articles() -> List[Dict]:
    print("📥 Fetching articles from RSS feeds...")
    articles = []
    for feed_url in RSS_FEEDS:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries[:5]:
            articles.append({
                "title": entry.title,
                "content": entry.get("summary", ""),
                "date": entry.get("published", ""),
                "category": "general",
                "tags": ["rss"],
                "source_url": entry.link
            })
    return articles

def translate(text: str, target_lang: str) -> str:
    try:
        result = translator.translate_text(text, target_lang=target_lang)
        return result.text
    except:
        return text

def process_article(article: Dict) -> Dict:
    return {
        "title_en": article["title"],
        "title_es": translate(article["title"], "ES"),
        "title_zh": translate(article["title"], "ZH"),
        "content_en": article["content"],
        "content_es": translate(article["content"], "ES"),
        "content_zh": translate(article["content"], "ZH"),
        "date": article["date"],
        "category": article["category"],
        "tags": article["tags"],
        "source_url": article["source_url"],
        "image": f"https://source.unsplash.com/600x400/?{article['category']},science"
    }

def run_pipeline():
    articles = fetch_arxiv_articles() + fetch_pubmed_articles() + fetch_rss_articles()
    articles.sort(key=lambda x: x.get("date", ""), reverse=True)
    selected = articles[:ARTICLES_PER_DAY]
    translated = [process_article(a) for a in selected]
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    print(f"💾 Saving to {OUTPUT_FILE}");
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(translated, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    run_pipeline()