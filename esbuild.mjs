// Builds the extension host (Node) and the webview (browser) as two separate bundles.
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const contexts = await Promise.all([
  esbuild.context({
    ...common,
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  }),
  esbuild.context({
    ...common,
    entryPoints: ['src/webview/index.tsx'],
    outfile: 'dist/webview.js', // CSS imported by the webview lands in dist/webview.css
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    jsx: 'automatic',
    loader: { '.ttf': 'file' }, // Monaco's codicon font
    define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
  }),
  // Monaco's background worker (diffing, link detection). The webview starts it from a blob URL.
  esbuild.context({
    ...common,
    entryPoints: ['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],
    outfile: 'dist/editor.worker.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }),
]);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
