import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths work on GitHub Pages project sites and Netlify.
  base: './',
  plugins: [react(), tailwindcss()],
})