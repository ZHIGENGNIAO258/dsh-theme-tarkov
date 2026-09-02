// Host-half route integration test with an isolated DSH_HOME: music library
// merge (bundled assets + user dir), add / delete routes, prefs round-trip and
// streaming. Run: node tests/host-routes.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarkov-host-'))
process.env.DSH_HOME = tmp
const mod = await import('../lib/index.js')
const MUSIC_DIR = path.join(tmp, 'dsh-tarkov', 'music')

// The package ships no music files by default (audio must be user-supplied).
// These tests still cover the "bundled track" code path, so a tiny dummy
// builtin track is created in assets/music for the run and removed after.
const BUILTIN_FILE = '__test_builtin.mp3'
const BUILTIN_NAME = '__test_builtin'
const BUILTIN_BYTES = Buffer.from('fake-builtin-track-bytes')
const bundledDir = path.join(__dirname, '..', 'assets', 'music')
fs.mkdirSync(bundledDir, { recursive: true })
fs.writeFileSync(path.join(bundledDir, BUILTIN_FILE), BUILTIN_BYTES)
test.after(() => {
  fs.rmSync(path.join(bundledDir, BUILTIN_FILE), { force: true })
})

const registered = []
const ctx = {
  inject: (deps, fn) => { if (deps.includes('settings')) fn({ settings: { register() {} } }) },
  on: () => {},
  effect: (fn) => { fn(); return () => {} },
  webServer: { register: (route) => { registered.push(route); return () => {} } },
  fs: { resolve: async (p) => p, listDir: async () => [], readBytes: async () => new Uint8Array(0) },
}
mod.apply(ctx)

function makeReq(method, url, body) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  if (body) queueMicrotask(() => req.emit('data', body))
  queueMicrotask(() => req.emit('end'))
  return req
}
function makeRes() {
  const res = { status: 0, headers: {}, chunks: [], done: false }
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {} }
  res.write = (chunk) => { res.chunks.push(Buffer.from(chunk)); return true }
  res.end = (chunk) => { if (chunk) res.chunks.push(Buffer.from(chunk)); res.done = true }
  // Node's pipe() drives the destination as an EventEmitter (emit / on / once),
  // so the mock needs the full surface or pipe throws inside the handler.
  res.emit = () => true
  res.on = () => res
  res.once = () => res
  res.removeListener = () => res
  res.off = () => res
  res.destroy = () => {}
  return res
}
function dispatch(method, url, body) {
  const pathname = url.split('?')[0]
  const route = registered.find((r) => r.path === pathname)
  assert.ok(route, 'route not registered: ' + pathname)
  const req = makeReq(method, url, body)
  const res = makeRes()
  route.handler(req, res)
  return res
}
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))
async function jsonRoute(method, url, body) {
  const res = dispatch(method, url, body)
  await tick()
  return { status: res.status, body: JSON.parse(Buffer.concat(res.chunks).toString('utf8') || '{}') }
}
function putPrefs(patch) {
  dispatch('PUT', '/dsh-tarkov/prefs', Buffer.from(JSON.stringify(patch)))
}

test('music list merges bundled assets with the user dir (all builtin when user dir is empty)', async () => {
  const { status, body } = await jsonRoute('GET', '/dsh-tarkov/music')
  assert.equal(status, 200)
  assert.ok(body.tracks.length >= 1, 'expected the test builtin track, got ' + body.tracks.length)
  assert.ok(body.tracks.every((t) => t.builtin === true), 'fresh user dir → all bundled')
  assert.ok(body.tracks.some((t) => t.name === BUILTIN_NAME))
})

test('add route streams a file into the user music dir', async () => {
  const bytes = Buffer.from('RIFF....WAVE-fake-content-0123456789')
  const { status, body } = await jsonRoute('POST', '/dsh-tarkov/music/add?name=my-song.wav', bytes)
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.track.builtin, false)
  assert.equal(fs.readFileSync(path.join(MUSIC_DIR, 'my-song.wav')).length, bytes.length)
})

test('list shows the added user track alongside bundled ones', async () => {
  const { body } = await jsonRoute('GET', '/dsh-tarkov/music')
  const mine = body.tracks.find((t) => t.id === 'my-song.wav')
  assert.equal(mine.builtin, false)
  assert.ok(body.tracks.length >= 2)
})

test('delete records builtin removal in prefs (and restore brings it back)', async () => {
  const builtin = await jsonRoute('POST', '/dsh-tarkov/music/delete', Buffer.from(JSON.stringify({ id: BUILTIN_FILE })))
  assert.equal(builtin.status, 200)
  assert.equal(builtin.body.ok, true)
  const list = await jsonRoute('GET', '/dsh-tarkov/music')
  assert.ok(!list.body.tracks.some((t) => t.name === BUILTIN_NAME), 'removed builtin must leave the list')
  const prefs = await jsonRoute('PUT', '/dsh-tarkov/prefs', Buffer.from(JSON.stringify({ music: { removed: [] } })))
  assert.equal(prefs.body.ok, true)
  assert.deepEqual(prefs.body.prefs.music.removed, [])
  const restored = await jsonRoute('GET', '/dsh-tarkov/music')
  assert.ok(restored.body.tracks.some((t) => t.name === BUILTIN_NAME), 'cleared removal restores the bundled track')
  // User tracks are still deleted from disk.
  const user = await jsonRoute('POST', '/dsh-tarkov/music/delete', Buffer.from(JSON.stringify({ id: 'my-song.wav' })))
  assert.equal(user.status, 200)
  assert.equal(user.body.ok, true)
  assert.ok(!fs.existsSync(path.join(MUSIC_DIR, 'my-song.wav')))
})

test('add rejects traversal and unknown extensions', async () => {
  const trav = await jsonRoute('POST', '/dsh-tarkov/music/add?name=..%2Fx.wav', Buffer.from('x'))
  assert.equal(trav.status, 400)
  const noext = await jsonRoute('POST', '/dsh-tarkov/music/add?name=x.exe', Buffer.from('x'))
  assert.equal(noext.status, 400)
})

test('prefs round-trip keeps music.disabled', async () => {
  const res = await jsonRoute('PUT', '/dsh-tarkov/prefs', Buffer.from(JSON.stringify({ music: { disabled: ['track2.wav', '../evil.wav'] } })))
  assert.equal(res.body.ok, true)
  assert.deepEqual(res.body.prefs.music.disabled, ['track2.wav'])
})

test('audio streams the user file over the bundled same-name file', async () => {
  putPrefs({ music: { enabled: true } })
  const bytes = Buffer.from('user-version')
  await jsonRoute('POST', '/dsh-tarkov/music/add?name=' + BUILTIN_NAME + '.wav', bytes)
  const res = dispatch('GET', '/dsh-tarkov/audio?id=' + BUILTIN_NAME + '.wav')
  const deadline = Date.now() + 5000
  while (!res.done && Date.now() < deadline) await tick(50)
  assert.equal(res.status, 200)
  assert.equal(Number(res.headers['content-length']), bytes.length)
  assert.equal(Buffer.concat(res.chunks).toString('utf8'), 'user-version')
  // Clean up the shadowing copy so later tests see the bundled file again.
  fs.unlinkSync(path.join(MUSIC_DIR, BUILTIN_NAME + '.wav'))
})

test('audio falls back to the bundled assets track', async () => {
  const assetStat = fs.statSync(path.join(bundledDir, BUILTIN_FILE))
  const res = dispatch('GET', '/dsh-tarkov/audio?id=' + BUILTIN_FILE)
  const deadline = Date.now() + 15000
  while (!res.done && Date.now() < deadline) await tick(100)
  assert.equal(res.status, 200)
  assert.equal(Number(res.headers['content-length']), assetStat.size)
  assert.equal(Buffer.concat(res.chunks).length, assetStat.size)
})
