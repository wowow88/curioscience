import fs from 'fs';
import fetch from 'node-fetch';
import Parser from 'rss-parser';
import { franc } from 'franc';

const parser = new Parser();
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DATA_PATH = './workspace/astro/public/articles_js.json';
fs.mkdirSync('./workspace/astro/public', { recursive: true });

const SOURCES = [
  { name: 'arXiv', url: 'http://export.arxiv.org/rss/cs' },
  { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10' },
  { name: 'Science.org', url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science' },
  { name: 'Nature', url: 'https://www.nature.com/nature.rss' },
  { name: 'AEMET', url: 'https://www.aemet.es/xml/boletin.rss' },
  { name: 'CNIC', url: 'https://www.cnic.es/es/rss.xml' },
  { name: 'CNIO', url: 'https://www.cnio.es/feed/' },
  { name: 'ISCIII', url: 'https://www.isciii.es/Noticias/Paginas/Noticias.aspx?rss=1' },
  { name: 'IEO', url: 'https://www.ieo.es/es_ES/web/ieo/noticias?p_p_id=rss_WAR_rssportlet_INSTANCE_wMyGl9T8Kpyx&p_p_lifecycle=2&p_p_resource_id=rss' },
  { name: 'IAC', url: 'https://www.iac.es/en/rss.xml' }
];

async function translateText(text) {
  try {
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`
      },
      body: new URLSearchParams({ text, target_lang: 'ES' })
    });
    const data = await response.json();
    return data.translations?.[0]?.text || text;
  } catch (err) {
    console.error('Translation error:', err);
    return text;
  }
}

function loadExistingArticles() {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

async function fetchArticles() {
  const previousArticles = loadExistingArticles();
  let newArticles = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const entry of feed.items.slice(0, 5)) {
        const lang = franc(entry.title || '');
        const title = entry.title;
        const title_es = lang === 'spa' ? title : await translateText(title);
        const date = new Date(entry.pubDate || Date.now()).toISOString().split('T')[0];

        newArticles.push({
          title,
          title_es,
          url: entry.link,
          date,
          source: source.name,
          content_es: '',
        });
      }
    } catch (e) {
      console.error(`Error fetching from ${source.name}:`, e.message);
    }
  }

  const allArticles = [...previousArticles, ...newArticles];
  const uniqueArticles = Array.from(new Map(allArticles.map(a => [a.url, a])).values());

  fs.writeFileSync(DATA_PATH, JSON.stringify(uniqueArticles, null, 2));
  console.log(`Guardados ${uniqueArticles.length} artículos únicos en ${DATA_PATH}`);
}

fetchArticles();
