import os
import json
import arxiv
import requests
import feedparser
from datetime import datetime
from typing import List, Dict
from deepl import Translator

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY") or "b726ddbc-f08d-473d-9185-2426e635d218:fx"
OUTPUT_PATH = "workspace/astro/public/articles.json"
ARTICLES_PER_DAY = 5

translator = Translator(DEEPL_API_KEY)

def translate(text: str, target_lang: str) -> str:
    try:
        return translator.translate_text(text, target_lang=target_lang).text
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def fetch_arxiv_articles() -> List[Dict]:
    results = arxiv.Search(query="cat:physics OR cat:cs.AI", max_results=10, sort_by=arxiv.SortCriterion.SubmittedDate)
    articles = []
    for result in results.results():
        articles.append({
            "title": result.title,
            "summary": result.summary,
            "url": result.entry_id,
            "date": result.published.strftime("%Y-%m-%d"),
            "source": "arXiv"
        })
    print(f"Fetched {len(articles)} from arXiv")
    return articles

def fetch_rss_articles(name: str, url: str, source: str) -> List[Dict]:
    try:
        feed = feedparser.parse(url)
        articles = []
        for entry in feed.entries[:5]:
            articles.append({
                "title": entry.title,
                "summary": entry.summary,
                "url": entry.link,
                "date": datetime(*entry.published_parsed[:3]).strftime("%Y-%m-%d") if hasattr(entry, "published_parsed") else datetime.now().strftime("%Y-%m-%d"),
                "source": source
            })
        print(f"Fetched {len(articles)} from {source}")
        return articles
    except Exception as e:
        print(f"Error fetching from {source}: {e}")
        return []

def translate_article(article: Dict) -> Dict:
    article["title"] = translate(article["title"], "ES")
    article["summary"] = translate(article["summary"], "ES")
    return article

def save_articles(articles: List[Dict]):
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(articles)} articles to {OUTPUT_PATH}")

def main():
    all_articles = (
        fetch_arxiv_articles() +
        fetch_rss_articles("Science RSS", "https://www.science.org/rss/news_current.xml", "Science.org") +
        fetch_rss_articles("Nature RSS", "https://www.nature.com/nature.rss", "Nature")
    )
    sorted_articles = sorted(all_articles, key=lambda x: x["date"], reverse=True)
    selected_articles = sorted_articles[:ARTICLES_PER_DAY]
    translated = [translate_article(article) for article in selected_articles]
    save_articles(translated)

if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
