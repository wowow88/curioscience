import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://curioscience.vercel.app',
  integrations: [
    tailwind(),
    sitemap(),
    mdx(),
    react()
  ],
  vite: {
    resolve: {
      alias: {
        '@components': './src/components',
        '@layouts': './src/layouts',
        '@pages': './src/pages',
        '@data': './workspace/data',
      }
    }
  }
});