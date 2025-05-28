import os
import json
import arxiv
import requests
import feedparser
from datetime import datetime
from typing import List, Dict
from deepl import Translator

OUTPUT_PATH = "workspace/data/articles.json"
ARTICLES_PER_DAY = 5

translator = Translator("b726ddbc-f08d-473d-9185-2426e635d218:fx")

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
    print(f"Fetched {len(articles)} from arXiv")
    return articles

def fetch_pubmed_articles() -> List[Dict]:
    # Usamos PubMed RSS para simplificar
    rss_url = "https://pubmed.ncbi.nlm.nih.gov/rss/search/1wE0ncbNN7B2jEXpOzPLuhzO3jQJz4kfbG7GxBFvXLbKbdRZcy/?limit=10&utm_campaign=pubmed-2&fc=20230508123456"
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
    print(f"Fetched {len(articles)} from PubMed")
    return articles

def fetch_rss_articles(source_name: str, url: str, category: str) -> List[Dict]:
    feed = feedparser.parse(url)
    articles = []
    for entry in feed.entries[:5]:
        articles.append({
            "title": entry.title,
            "content": entry.summary,
            "date": datetime(*entry.published_parsed[:3]).strftime("%Y-%m-%d") if hasattr(entry, "published_parsed") else datetime.now().strftime("%Y-%m-%d"),
            "category": category,
            "tags": [category],
            "source_url": entry.link
        })
    print(f"Fetched {len(articles)} from {source_name}")
    return articles

def translate_article(article: Dict) -> Dict:
    try:
        original_title = str(article.get("title", ""))
        original_content = str(article.get("content", ""))
        
        article["title_en"] = original_title
        article["title_es"] = translate(original_title, "ES")
        article["title_zh"] = translate(original_title, "ZH")
        article["content_en"] = original_content
        article["content_es"] = translate(original_content, "ES")
        article["content_zh"] = translate(original_content, "ZH")

        # Solo eliminamos los originales si todo fue bien
        if article["title_es"] and article["content_es"]:
            article.pop("title", None)
            article.pop("content", None)
    except Exception as e:
        print(f"Error translating article: {e}")
    return article

def save_articles(articles: List[Dict]):
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(articles)} articles to {OUTPUT_PATH}")

def main():
    all_articles = (
        fetch_arxiv_articles() +
        fetch_pubmed_articles() +
        fetch_rss_articles("Science RSS", "https://www.science.org/rss/news_current.xml", "science") +
        fetch_rss_articles("Nature RSS", "https://www.nature.com/nature.rss", "nature")
    )
    sorted_articles = sorted(all_articles, key=lambda x: x["date"], reverse=True)
    selected_articles = sorted_articles[:ARTICLES_PER_DAY]
    translated = [translate_article(article) for article in selected_articles]
    save_articles(translated)

if __name__ == "__main__":
    main()
