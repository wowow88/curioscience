import json
import os
import requests
import feedparser
from datetime import datetime
from arxiv import Search, SortCriterion
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY")

def translate(text, target_lang='ES'):
    try:
        return GoogleTranslator(source='auto', target=target_lang.lower()).translate(text)
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def fetch_arxiv():
    articles = []
    results = Search(query="cat:cs.AI", max_results=10, sort_by=SortCriterion.SubmittedDate).results()
    for result in results:
        article = {
            "title": result.title,
            "url": result.entry_id,
            "date": result.published.date().isoformat(),
            "source": "arXiv",
            "summary": result.summary
        }
        articles.append(article)
    print("Fetched from arXiv:", len(articles))
    return articles

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

        })
    print(f"Fetched {len(articles)} from {source_name}")
    return articles


def main():
    all_articles = []
    all_articles += fetch_arxiv()
    all_articles += fetch_rss("Science.org", "https://www.science.org/rss/news_current.xml")
    all_articles += fetch_rss("Nature", "https://www.nature.com/nature/articles?type=article.rss")

    for article in all_articles:
        article["title_es"] = translate(article["title"], "es")
        article["summary_es"] = translate(article["summary"], "es")

    output_path = "workspace/astro/public/articles.json"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(all_articles)} articles to {output_path}")

if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
