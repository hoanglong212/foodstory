// Vitest config for the Tier 1D Vision Auto lifecycle harness.
//
// The test file lives in benchmark/ so the harness stays out of the runtime source
// tree, but it imports Vue components from frontend/src. Bare specifiers resolve
// relative to the importing file, so without aliases the test would load Vue from
// benchmark/node_modules while the SFCs load it from frontend/node_modules — two Vue
// instances, and reactivity breaks. The aliases below pin one shared copy.

import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const FE = 'C:/COS30043/foodstory/frontend/node_modules';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Alias to the package DIRECTORY, not a guessed dist filename: Vite then resolves
    // each package's own exports/module entry. Hardcoded dist paths broke vue-router 5,
    // whose ESM entry is dist/vue-router.js rather than a .mjs file.
    alias: [
      { find: /^vue$/, replacement: `${FE}/vue` },
      { find: /^pinia$/, replacement: `${FE}/pinia` },
      { find: /^vue-router$/, replacement: `${FE}/vue-router` },
      { find: /^@vue\/test-utils$/, replacement: `${FE}/@vue/test-utils` },
      { find: /^leaflet$/, replacement: `${FE}/leaflet` },
      { find: /^leaflet\.markercluster$/, replacement: `${FE}/leaflet.markercluster` },
      { find: /^chart\.js\/auto$/, replacement: `${FE}/chart.js/auto` },
      { find: /^chart\.js$/, replacement: `${FE}/chart.js` },
      { find: /^axios$/, replacement: `${FE}/axios` },
    ],
  },
  server: { fs: { allow: ['C:/COS30043/foodstory'] } },
  test: {
    root: 'C:/COS30043/foodstory',
    server: { deps: { inline: [/frontend[\/]src/, /benchmark[\/]harness/] } },
    include: ['benchmark/harness/vision-lifecycle.test.js'],
    environment: 'jsdom',
    restoreMocks: false,
    testTimeout: 900000,
    hookTimeout: 900000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ["--expose-gc"] },
    reporters: ['default'],
  },
});
