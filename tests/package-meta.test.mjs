// The package's display metadata: `package.json.icon` is what the Plugins page
// renders at the left of this bundle's row. dsh-app-boot reads it into a data
// URL and enforces the rules below, so an icon that violates them makes the
// plugin list fall back to the default artwork (with a diagnostic) instead of
// showing this package's mark. Mirrors dsh-app-boot's iconOf().
// Run: node tests/package-meta.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

/** dsh-app-boot: maximum raw icon bytes admitted to plugin metadata. */
const MAX_ICON_BYTES = 256 * 1024
/** dsh-app-boot: ICON_MEDIA_TYPES. */
const ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp']

test('package.json declares a row icon the Plugins page can render', () => {
  const icon = manifest.icon
  assert.equal(typeof icon, 'string', 'package.json must declare an icon path')
  assert.ok(icon.length > 0, 'the icon path must not be empty')
  assert.ok(!path.isAbsolute(icon) && !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon),
    'the icon must be a relative file path (absolute paths and URL schemes are rejected)')
  assert.ok(ICON_EXTENSIONS.includes(path.extname(icon).toLowerCase()),
    'the icon must be SVG, PNG, JPEG, or WebP, got ' + path.extname(icon))
})

test('the icon file exists, stays inside the package, and fits the 256 KiB budget', () => {
  const icon = manifest.icon
  const file = path.resolve(root, icon)
  const local = path.relative(root, file)
  assert.ok(!local.startsWith('..') && !path.isAbsolute(local), 'the icon must remain inside the package')
  assert.ok(fs.statSync(file).isFile(), 'the icon must be a regular file')
  const size = fs.statSync(file).size
  assert.ok(size <= MAX_ICON_BYTES, `the icon must be at most ${MAX_ICON_BYTES} bytes, got ${size}`)
  // PNG signature: the shipped mark is a PNG, so a truncated copy fails here.
  const head = fs.readFileSync(file).subarray(0, 8)
  assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'the icon must be a valid PNG')
})

test('the published file set ships the icon', () => {
  const files = manifest.files ?? []
  assert.ok(files.includes('assets'), 'package.json files must ship assets/ (where the icon lives)')
})
