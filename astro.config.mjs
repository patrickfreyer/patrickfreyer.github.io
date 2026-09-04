import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';
import sitemap from '@astrojs/sitemap';

// https://astro.build
export default defineConfig({
  site: 'https://patrickfreyer.com',

  // Jekyll served /flights/ as a directory index; keep those URLs byte-for-byte.
  trailingSlash: 'always',
  build: { format: 'directory' },

  // Emits /sitemap-index.xml + /sitemap-0.xml from the route list.
  integrations: [sitemap()],

  vite: {
    // lets pages `import data from '../data/social.yaml'` at build time
    plugins: [yaml()],
  },
});
