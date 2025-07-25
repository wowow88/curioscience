
import json
import feedparser
from deep_translator import GoogleTranslator
from datetime import datetime

FEEDS = {
    "arXiv Física": "http://export.arxiv.org/rss/physics",
    "arXiv Biología": "http://export.arxiv.org/rss/q-bio",
    "Nature": "https://www.nature.com/subjects/science/rss",
    "El País Ciencia": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada"
}

def clasificar_tema(titulo):
    titulo = titulo.lower()
    if "físic" in titulo: return "física"
    if "biolog" in titulo: return "biología"
    if "químic" in titulo: return "química"
    if "astro" in titulo: return "astronomía"
    if "medicin" in titulo or "salud" in titulo: return "medicina"
    if "tecnolog" in titulo or "comput" in titulo: return "tecnología"
    if "ambiente" in titulo or "clima" in titulo: return "medio ambiente"
    if "inteligencia artificial" in titulo or "machine learning" in titulo: return "inteligencia artificial"
    return "otros"

articulos = []

for fuente, url in FEEDS.items():
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:5]:
            titulo = entry.title
            traducido = GoogleTranslator(source='auto', target='es').translate(titulo)
            articulo = {
                "titulo_es": traducido,
                "tema": clasificar_tema(traducido),
                "fuente": fuente,
                "fecha": entry.get("published", datetime.utcnow().isoformat())[:10],
                "url": entry.link,
                "tipo": "revista",
                "imagen": "/placeholder.jpg"
            }
            articulos.append(articulo)
    except Exception as e:
        print(f"[{fuente}] Error procesando feed: {e}")


with open("articles.json", "w", encoding="utf-8") as f:
    json.dump(articulos, f, ensure_ascii=False, indent=2)
