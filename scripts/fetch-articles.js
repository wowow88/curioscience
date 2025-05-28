// scripts/fetch-articles.js
import fs from 'fs';
import fetch from 'node-fetch';
import Parser from 'rss-parser';
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
const DATA_PATH = './workspace/data/articles.json';

async function fetchArticles() {
  let allArticles = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const entry = feed.items[0];
      if (entry) {
        allArticles.push({
          title: entry.title,
          url: entry.link,
          date: today,
          source: source.name,
          summary: entry.contentSnippet || '',
        });
      }
    } catch (e) {
      console.error(`Error fetching from ${source.name}:`, e.message);
    }
  }

  let existing = [];
  if (fs.existsSync(DATA_PATH)) {
    existing = JSON.parse(fs.readFileSync(DATA_PATH));
  }

  const merged = [...allArticles, ...existing.filter(a => a.date !== today)];
  fs.mkdirSync('./workspace/data', { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(merged, null, 2));
  console.log('Artículos actualizados:', merged.length);
}

fetchArticles();

