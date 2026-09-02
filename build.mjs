// Build the Host half: inline @deepseek-ai/schemastery (and any future
// dependency) into lib/index.js. A linked plugin's host half resolves imports
// from its real source path, where third-party packages are unavailable, so
// the shipped artifact must be self-contained.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
  external: ['node:*'],
})

console.log('dsh-theme-tarkov: built lib/index.js')
