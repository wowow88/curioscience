import os
import json
import arxiv
import requests
import feedparser
from datetime import datetime
from typing import List, Dict
from deepl import Translator

OUTPUT_PATH = "workspace/astro/public/articles.json"
ARTICLES_PER_DAY = 5

translator = Translator(os.getenv("DEEPL_API_KEY"))

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
            "content": result.summary,
            "date": result.published.strftime("%Y-%m-%d"),
            "category": result.primary_category,
            "tags": result.categories,
            "source_url": result.entry_id
        })
    return articles

def fetch_pubmed_articles() -> List[Dict]:
    rss_url = "https://pubmed.ncbi.nlm.nih.gov/rss/search/1wE0ncbNN7B2jEXpOzPLuhzO3jQJz4kfbG7GxBFvXLbKbdRZcy/?limit=10"
    feed = feedparser.parse(rss_url)
    articles = []
    for entry in feed.entries:
        articles.append({
            "title": entry.title,
            "content": entry.summary,
            "date": datetime(*entry.published_parsed[:3]).strftime("%Y-%m-%d"),
            "category": "pubmed",
            "tags": ["health", "medicine"],
            "source_url": entry.link
        })
    return articles

def translate_article(article: Dict) -> Dict:
    article["title_es"] = translate(article["title"], "ES")
    article["content_es"] = translate(article["content"], "ES")
    article["url"] = article.pop("source_url")
    article["source"] = article.pop("category")
    return article

def save_articles(articles: List[Dict]):
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)

def main():
    all_articles = fetch_arxiv_articles() + fetch_pubmed_articles()
    sorted_articles = sorted(all_articles, key=lambda x: x["date"], reverse=True)
    selected_articles = sorted_articles[:ARTICLES_PER_DAY]
    translated = [translate_article(article) for article in selected_articles]
    save_articles(translated)

if __name__ == "__main__":
    main()
if __name__ == "__main__":
    main()
