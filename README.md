# CurioSciencie

CurioSciencie is a modern, bilingual science communication website built with Astro.

## 🌐 Features

- ✅ Automatic daily science articles (English and Spanish)
- ✅ AI-powered translation using DeepL
- ✅ Filter by category and search by keyword
- ✅ Language switcher (EN/ES)
- ✅ Clean, responsive design (mobile and desktop)
- ✅ Custom logo and favicon
- ✅ SEO optimized with meta tags and sitemap
- ✅ Monetization support (Google AdSense, BuyMeACoffee)
- ✅ Easily deployable on Vercel

## 📁 Project Structure

```
workspace/
├── data/articles.json     # Daily updated articles (EN/ES)
├── data_pipeline.py       # Script to fetch + translate new articles
astro/
├── src/pages/index.astro  # Main page rendering articles
├── public/logo.png        # Custom logo
├── public/favicon.ico     # Site icon
```

## 🚀 Deploy Instructions

1. Install dependencies:
```bash
npm install --legacy-peer-deps
```

2. Build the project:
```bash
npm run build
```

3. Preview locally:
```bash
npm run dev
```

4. Deploy on Vercel with:
- **Root directory:** `workspace/astro`
- **Build command:** `npm run build`
- **Output directory:** `dist`

## 💡 License

This project is open-source and intended for educational, nonprofit, and science communication purposes.

---

Built by AI and science enthusiasts. Visit: https://curioscience.vercel.app
