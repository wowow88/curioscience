import fs from 'fs';
import fetch from 'node-fetch';
import Parser from 'rss-parser';
import { franc } from 'franc';

const parser = new Parser();

const SOURCES = [
  {
    name: 'arXiv',
    url: 'http://export.arxiv.org/rss/cs',
  },
  {
    name: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1G9yX0r5TrO6jPB23sOZJ8kPZt7OeEMeP3Wrxsk4NxlMVi4T5L/?limit=10',
  },
  {
    name: 'Science.org',
    url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science',
  },
  {
    name: 'Nature',
    url: 'https://www.nature.com/nature.rss',
  }
];

const today = new Date().toISOString().split('T')[0];
const DATA_PATH = './workspace/astro/public/articles_js.json';
fs.mkdirSync('./workspace/astro/public', { recursive: true });

function truncate(text, max = 350) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function fetchArticles() {
  let allArticles = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const entry = feed.items[0];
      if (entry) {
        const lang = franc(entry.title || entry.contentSnippet || '');
        if (lang === 'spa') continue; // Ignorar artículos ya en español

        allArticles.push({
          title: entry.title,
          url: entry.link,
          date: today,
          source: source.name,
          summary: truncate(entry.contentSnippet || ''),
        });
      }
    } catch (e) {
      console.error(`Error fetching from ${source.name}:`, e.message);
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(allArticles, null, 2));
  console.log(`Saved ${allArticles.length} articles to ${DATA_PATH}`);
}

fetchArticles();

}

fetchArticles();
