import { readFile } from 'node:fs/promises';
import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  charset: 'utf8',
  outfile: 'U-plus-Assistant.user.js',
  banner: { js: (await readFile('src/userscript.meta.js', 'utf8')) + "\n'use strict';" },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const builder = await context(options);
  await builder.watch();
} else {
  await build(options);
}
