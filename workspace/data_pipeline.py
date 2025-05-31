import json
import requests
import feedparser
import arxiv
import datetime
import os
from deepl import Translator

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY")
translator = Translator(DEEPL_API_KEY)

today = datetime.date.today().isoformat()

def translate(text, target_lang='ES'):
    try:
        result = translator.translate_text(text, target_lang=target_lang)
        return result.text
    except Exception as e:
        print(f"Error translating: {e}")
        return text

def fetch_arxiv():
    articles = []
    search = arxiv.Search(
        query="cat:cs.AI OR cat:physics.gen-ph",
        max_results=5,
        sort_by=arxiv.SortCriterion.SubmittedDate
    )
    for result in search.results():
        articles.append({
            "title": result.title,
            "summary": result.summary,
            "url": result.entry_id,
            "date": result.published.date().isoformat(),
            "source": "arXiv"
        })
    print(f"Fetched {len(articles)} from arXiv")
    return articles

def fetch_rss(url, source):
    articles = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:5]:
            articles.append({
                "title": entry.title,
                "summary": entry.get("summary", ""),
                "url": entry.link,
                "date": today,
                "source": source
            })
    except Exception as e:
        print(f"Error fetching from {source}: {e}")
    print(f"Fetched {len(articles)} from {source} RSS")
    return articles

def process_articles(raw_articles):
    processed = []
    for art in raw_articles:
        translated_title = translate(art["title"])
        translated_summary = translate(art["summary"])
        processed.append({
            "title": art["title"],
            "summary": art["summary"],
            "title_es": translated_title,
            "content_es": translated_summary,
            "url": art["url"],
            "date": art["date"],
            "source": art["source"]
        })
    return processed

if __name__ == "__main__":
    arxiv_articles = fetch_arxiv()
    science_articles = fetch_rss("https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", "Science.org")
    nature_articles = fetch_rss("https://www.nature.com/nature.rss", "Nature")

    all_raw_articles = arxiv_articles + science_articles + nature_articles
    final_articles = process_articles(all_raw_articles)

    output_path = "workspace/astro/public/articles.json"
    with open(output_path, "w") as f:
        json.dump(final_articles, f, indent=2, ensure_ascii=False)
    
    print(f"Artículos actualizados: {len(final_articles)}")
    print(f"Saved {len(final_articles)} articles to {output_path}")


if __name__ == "__main__":
    main()
