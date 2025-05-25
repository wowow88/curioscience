import os
import json
import arxiv
import requests
from datetime import datetime
from typing import List, Dict

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY")
OUTPUT_FILE = "workspace/data/articles.json"
ARTICLES_PER_DAY = 3

DEEPL_URL = "https://api-free.deepl.com/v2/translate"
HEADERS = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}"}


def fetch_arxiv_articles() -> List[Dict]:
    search = arxiv.Search(query="cat:physics OR cat:cs.AI", max_results=10, sort_by=arxiv.SortCriterion.SubmittedDate)
    articles = []
    for result in arxiv.Client().results(search):
        articles.append({
            "title": result.title,
            "content": result.summary,
            "date": result.published.strftime("%Y-%m-%d"),
            "category": result.primary_category,
            "tags": result.categories,
            "source_url": result.entry_id
        })
    return articles


def translate_text(text: str, target_lang: str) -> str:
    try:
        res = requests.post(DEEPL_URL, headers=HEADERS, data={"text": text, "target_lang": target_lang})
        return res.json()["translations"][0]["text"]
    except:
        return ""


def translate_article(article: Dict) -> Dict:
    return {
        "title_en": article["title"],
        "title_es": translate_text(article["title"], "ES"),
        "content_en": article["content"],
        "content_es": translate_text(article["content"], "ES"),
        "date": article["date"],
        "category": article["category"],
        "tags": article["tags"],
        "source_url": article["source_url"]
    }


def save_articles(articles: List[Dict]):
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)


def run_pipeline():
    raw = fetch_arxiv_articles()[:ARTICLES_PER_DAY]
    translated = [translate_article(a) for a in raw]
    save_articles(translated)
    print(f"✅ {len(translated)} articles saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    run_pipeline()
