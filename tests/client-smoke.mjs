// Client-half smoke test: execute lib/client.js inside a stubbed browser
// sandbox and run apply() with a stubbed ctx — the same path the real
// runtime takes on page load. Any throw here is a "stuck at loading plugins"
// candidate. Run: node tests/client-smoke.mjs
import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function makeEl() {
  return {
    style: { setProperty() {} },
    className: '',
    textContent: '',
    children: [],
    value: '',
    options: [],
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    append() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    insertBefore() {},
    isConnected: true,
  }
}

function buildEnv() {
  const env = {
    console,
    localStorage: { store: {}, getItem(k) { return this.store[k] ?? null }, setItem(k, v) { this.store[k] = String(v) }, removeItem(k) { delete this.store[k] } },
    document: {
      head: { appendChild() {} },
      body: { appendChild() {}, contains: () => true, remove() {} },
      documentElement: {},
      createElement: () => makeEl(),
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: (url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ prefs: null, items: [], tracks: [], dir: 'dir' }), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    Audio: function () { return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeAttribute() {}, src: '', volume: 1, paused: true } },
    AudioContext: function () { return { state: 'running', currentTime: 0, resume: () => Promise.resolve(), createGain: () => ({ gain: { value: 0 }, connect() {} }), createBufferSource: () => ({ buffer: null, connect() {}, start() {} }), createBuffer: () => ({ getChannelData: () => new Float32Array(0) }), decodeAudioData: () => Promise.resolve(null), destination: {} } },
    BroadcastChannel: function () { return { onmessage: null, postMessage() {}, close() {} } },
    MutationObserver: function () { return { observe() {}, disconnect() {} } },
    FileReader: function () { return {} },
    atob: (s) => s,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    URL,
  }
  env.window = {
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
    setTimeout: env.setTimeout,
    clearTimeout: env.clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    AudioContext: env.AudioContext,
    webkitAudioContext: undefined,
    __ModuleLoader__: { load(d) { env.__moduleDefinition = d } },
  }
  return env
}

test('client factory initializes and apply() runs without throwing', async () => {
  const env = buildEnv()
  vm.runInNewContext(source, env, { filename: 'lib/client.js' })
  assert.ok(env.__moduleDefinition, 'client must call __ModuleLoader__.load')

  const ReactStub = {
    createElement: () => ({}),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
  }
  const exports = env.__moduleDefinition.factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error('unexpected require: ' + id)
  })
  assert.equal(typeof exports.apply, 'function')

  const slotsStub = { inject() {} }
  const effects = []
  const ctx = {
    get: (name) => (name === 'slots' ? slotsStub : undefined),
    effect: (fn) => { effects.push(fn); return () => {} },
  }
  await exports.apply(ctx)
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }
  assert.ok(true, 'apply completed')
})
