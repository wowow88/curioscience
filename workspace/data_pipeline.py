import os
import json
import requests
import feedparser
import deepl
from datetime import datetime
from arxiv import Search

DEEPL_KEY = os.getenv("DEEPL_API_KEY")

def translate(text, target_lang="ES"):
    if not text.strip():
        return ""
    try:
        translator = deepl.Translator(DEEPL_KEY)
        result = translator.translate_text(text, target_lang=target_lang)
        return result.text
    except Exception as e:
        print("DeepL translation error:", e)
        return text

def fetch_arxiv():
    results = Search(query="cat:cs.AI", max_results=10, sort_by="submittedDate").results()
    articles = []
    for result in results:
        title = result.title
        summary = result.summary
        url = result.entry_id
        date = result.published.date().isoformat()
        articles.append({
            "title": title,
            "title_es": translate(title),
            "content": summary,
            "content_es": translate(summary),
            "url": url,
            "date": date,
            "source": "arXiv"
        })
    return articles

def fetch_rss(url, source_name):
    feed = feedparser.parse(url)
    articles = []
    for entry in feed.entries[:5]:
        title = entry.title
        summary = entry.get("summary", "")
        link = entry.link
        date = entry.get("published", "")[:10]
        articles.append({
            "title": title,
            "title_es": translate(title),
            "content": summary,
            "content_es": translate(summary),
            "url": link,
            "date": date,
            "source": source_name
        })
    return articles

if __name__ == "__main__":
    all_articles = []
    all_articles += fetch_arxiv()
    all_articles += fetch_rss("https://www.sciencemag.org/rss/news_current.xml", "Science")
    all_articles += fetch_rss("https://www.nature.com/nature.rss", "Nature")

    # Guardar en public
    os.makedirs("workspace/astro/public", exist_ok=True)
    with open("workspace/astro/public/articles.json", "w") as f:
        json.dump(all_articles, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(all_articles)} articles to workspace/astro/public/articles.json")


if __name__ == "__main__":
    main()
