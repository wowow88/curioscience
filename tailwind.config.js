import { fontFamily } from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
    './public/**/*.html'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1F2937',  // gris oscuro elegante
        secondary: '#3B82F6', // azul ciencia
        accent: '#10B981',    // verde moderno
        background: '#F9FAFB',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
        serif: ['Merriweather', ...fontFamily.serif],
      },
    },
  },
  plugins: [],
}
