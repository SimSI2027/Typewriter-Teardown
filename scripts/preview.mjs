// Serve the production build under the GitHub Pages base path: node scripts/preview.mjs [port]
import {serve} from './serve.mjs';
const port = Number(process.argv[2] || 4173);
const s = await serve({dir: 'dist', port, base: '/Typewriter-Teardown/'});
console.log(`preview: ${s.url}`);
