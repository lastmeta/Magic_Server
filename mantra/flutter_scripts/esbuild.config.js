// esbuild.config.js
const esbuild = require('esbuild');
const nodePolyfills  = require('esbuild-plugin-node-polyfills');

esbuild
  .build({
    entryPoints: ['decodeTxHex.ts'],
    bundle: true,
    outfile: 'dist/decodeTxHex.bundle.js',
    platform: 'browser',
    format: 'iife',
    target: 'es6',
    plugins: [nodePolyfills],
  })
  .then(() => console.log('Build succeeded'))
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });