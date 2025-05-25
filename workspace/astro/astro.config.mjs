import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: 'https://curioscience.vercel.app',
  integrations: [tailwind()],
  outDir: 'dist'
});