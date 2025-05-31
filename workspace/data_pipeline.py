import json
import requests
import feedparser
from bs4 import BeautifulSoup
from datetime import datetime
from deep_translator import GoogleTranslator
from arxiv import Search, SortCriterion


def fetch_arxiv():
    results = Search(query="cat:cs.AI", max_results=10, sort_by=SortCriterion.SubmittedDate).results()
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
    else:
        return {
            "title": article["title"],
            "title_es": article["title"],
            "url": article["url"],
            "date": article["date"],
            "source": article["source"],
            "content_es": article.get("summary", "")
        }

    }
    return translated


def main():
    all_articles = []
    all_articles += fetch_arxiv()
    all_articles += fetch_rss("Science.org", "https://www.science.org/rss/news_current.xml")
    all_articles += fetch_rss("Nature", "https://www.nature.com/nature/articles?type=news&format=rss")

    translated_articles = [translate_article(article) for article in all_articles]
    print("Artículos actualizados:", len(translated_articles))

    with open("workspace/astro/public/articles.json", "w", encoding="utf-8") as f:
        json.dump(translated_articles, f, ensure_ascii=False, indent=2)
    print("Saved", len(translated_articles), "articles to workspace/astro/public/articles.json")


if __name__ == "__main__":
    main()



if __name__ == "__main__":
    main()
