import { defineConfig } from 'vite';

// GitHub Pages serves project sites under /<repo>/; the workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
