// dsh-theme-tarkov — Host half.
// Prefs store with feature-gated routes, the session-event sfx queue, the BGM
// library (bundled assets/music + user music dir) with add/delete routes, and
// the settings-namespace registration that makes the browser card render
// inside Settings → Plugins → 插件配置.
// Built with esbuild (npm run build) so the schemastery dependency is inlined:
// a linked plugin's host half cannot resolve third-party packages at runtime.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_SFX = path.join(__dirname, '..', 'assets', 'sfx')
const ASSETS_MUSIC = path.join(__dirname, '..', 'assets', 'music')
const ASSETS_PET = path.join(__dirname, '..', 'assets', 'pet')
const ASSETS_VOICE = path.join(ASSETS_PET, 'voice')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA_DIR = path.join(DSH_HOME, 'dsh-tarkov')
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds')
const MUSIC_DIR = path.join(DATA_DIR, 'music')
const VOICE_DIR = path.join(DATA_DIR, 'voice')
const PET_DIR = path.join(DATA_DIR, 'pet')
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json')
const PET_IMAGE_EXTS = ['png', 'gif', 'webp', 'jpg', 'jpeg']
// Status-line copy pool: plain text files shipped inside the package, read per
// request so editing them needs only a page refresh (no host restart). The
// browser half cannot touch the filesystem, so it fetches them through
// GET /dsh-tarkov/status-texts.
const ASSETS_STATUS = path.join(__dirname, '..', 'assets', 'status')
const STATUS_LANGS = ['zh', 'en']
const STATUS_TEXT_MAX = 200
const STATUS_POOL_MAX = 200
const MAX_PENDING = 3
const MAX_MUSIC_BYTES = 200 * 1024 * 1024
const SFX_KINDS = ['done', 'approval', 'error']
// Browser card seat: settings.plugin.item dispatches exactly the registered
// namespaces, so the namespace name must equal the card key in lib/client.js.
// The schema stays deliberately shallow — the real configuration lives in the
// plugin's prefs.json; a namespace with an empty section is enough to claim
// the card. Keep it empty-object tolerant: no user-editable fields here.
const SETTINGS_NS = 'dsh-theme-tarkov'
const TarkovSettingsSchema = z.object({})
const MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

export const DEFAULT_PREFS = {
  banner: {
    enabled: true,
    text1: '注意！这是“Deepseek Harness”的Beta测试版本。',
    text2: 'Beta测试版本不代表本产品的最终质量。感谢您的理解和支持，祝你好运！',
    opacity: 0.55,
  },
  sfx: {
    enabled: true,
    volume: 70,
    // '' means the bundled seed sound; otherwise a { dataUrl, name } custom clip.
    sounds: { done: null, approval: null, error: null },
  },
  music: {
    enabled: false,
    volume: 40,
    trackId: null,
    // Track ids (file names) the user muted; excluded from the playable list.
    disabled: [],
    // Bundled track ids the user deleted; excluded from the library until the
    // client restores them (the files are never removed from the package).
    removed: [],
  },
  pet: {
    enabled: true,
    size: 160,
    volume: 70,
  },
}

/**
 * Merge a partial prefs patch field-wise over the current prefs, so the client
 * can PUT only what changed (e.g. { music: { trackId } }) without resending
 * the custom-sound dataUrls. Absent keys keep base values; explicit nulls stay.
 */
export function mergePrefs(base, patch) {
  const out = JSON.parse(JSON.stringify(base))
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return out
  for (const group of ['banner', 'sfx', 'music', 'pet']) {
    const p = patch[group]
    if (p === null || typeof p !== 'object' || Array.isArray(p)) continue
    out[group] = { ...out[group], ...p }
    if (group === 'sfx' && p.sounds && typeof p.sounds === 'object') {
      out.sfx.sounds = { ...out.sfx.sounds, ...p.sounds }
    }
  }
  return out
}

/** Validate and merge an untrusted prefs object against the defaults. */
export function sanitizePrefs(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PREFS))
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  const num = (v, min, max, fallback) => (typeof v === 'number' && v >= min && v <= max ? v : fallback)
  const str = (v, fallback, max = 500) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : fallback)
  const b = raw.banner
  if (b && typeof b === 'object') {
    if (typeof b.enabled === 'boolean') out.banner.enabled = b.enabled
    out.banner.text1 = str(b.text1, out.banner.text1)
    out.banner.text2 = str(b.text2, out.banner.text2)
    out.banner.opacity = num(b.opacity, 0, 1, out.banner.opacity)
  }
  const s = raw.sfx
  if (s && typeof s === 'object') {
    if (typeof s.enabled === 'boolean') out.sfx.enabled = s.enabled
    out.sfx.volume = num(s.volume, 0, 100, out.sfx.volume)
    if (s.sounds && typeof s.sounds === 'object') {
      for (const kind of SFX_KINDS) {
        const c = s.sounds[kind]
        if (c === null) {
          out.sfx.sounds[kind] = null
        } else if (c && typeof c === 'object' && typeof c.dataUrl === 'string' && typeof c.name === 'string' && c.dataUrl.length <= 2 * 1024 * 1024) {
          out.sfx.sounds[kind] = { dataUrl: c.dataUrl, name: c.name }
        }
      }
    }
  }
  const m = raw.music
  if (m && typeof m === 'object') {
    if (typeof m.enabled === 'boolean') out.music.enabled = m.enabled
    out.music.volume = num(m.volume, 0, 100, out.music.volume)
    if (m.trackId === null) {
      out.music.trackId = null
    } else if (typeof m.trackId === 'string' && m.trackId.length > 0 && m.trackId.length <= 200 && !/[\\/]/.test(m.trackId) && !m.trackId.includes('..')) {
      out.music.trackId = m.trackId
    }
    // Shared validator for id lists (disabled / removed): strings only, no
    // path separators, deduped and capped.
    const idList = (v, key) => {
      if (!Array.isArray(v)) return
      const seen = new Set()
      const list = []
      for (const item of v) {
        if (typeof item !== 'string' || item.length === 0 || item.length > 200) continue
        if (/[\\/]/.test(item) || item.includes('..')) continue
        if (seen.has(item)) continue
        seen.add(item)
        list.push(item)
        if (list.length >= 200) break
      }
      out.music[key] = list
    }
    idList(m.disabled, 'disabled')
    idList(m.removed, 'removed')
  }
  const p = raw.pet
  if (p && typeof p === 'object') {
    if (typeof p.enabled === 'boolean') out.pet.enabled = p.enabled
    out.pet.size = Math.round(num(p.size, 80, 240, out.pet.size))
    out.pet.volume = num(p.volume, 0, 100, out.pet.volume)
  }
  return out
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'))
    return sanitizePrefs(parsed)
  } catch (error) {
    return JSON.parse(JSON.stringify(DEFAULT_PREFS))
  }
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2))
  } catch (error) {
    console.error('dsh-theme-tarkov: prefs write failed', error)
  }
}

/**
 * Parse one status pool file into display entries: one entry per line, '#'
 * comments and blank lines dropped, trimmed, deduped, length- and count-capped.
 * Pure so tests can drive it directly without touching the filesystem.
 * @param text - raw file contents (anything else yields an empty pool).
 * @returns the ordered pool.
 */
export function parseStatusTexts(text) {
  const out = []
  const seen = new Set()
  if (typeof text !== 'string') return out
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.length > STATUS_TEXT_MAX) continue
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
    if (out.length >= STATUS_POOL_MAX) break
  }
  return out
}

/**
 * Read every bundled status pool. An absent or empty pool is reported as an
 * empty list and an all-empty result disables the feature, so the status line
 * keeps its stock copy instead of going blank.
 * @returns { enabled, texts: { zh: string[], en: string[] } }
 */
function readStatusTexts() {
  const texts = {}
  for (const lang of STATUS_LANGS) {
    let raw = ''
    try {
      raw = fs.readFileSync(path.join(ASSETS_STATUS, 'texts.' + lang + '.txt'), 'utf8')
    } catch (error) {
      raw = ''
    }
    texts[lang] = parseStatusTexts(raw)
  }
  return { enabled: STATUS_LANGS.some((lang) => texts[lang].length > 0), texts }
}

/**
 * Pure classifier: one session-log event → notification type, or null.
 * turn/end is a SessionEvent (not a Cordis event); its reason.kind is the
 * authoritative outcome (completed | blocked | aborted | error | max-tokens).
 * approval/asked marks the human-confirmation moment; ask_user_question is
 * picked up from its tool/call because it logs no dedicated event.
 */
export function classifySessionEvent(event) {
  if (event === null || typeof event !== 'object') return null
  if (event.type === 'turn/end') {
    const kind = event.data && event.data.reason && event.data.reason.kind
    if (kind === 'completed') return 'done'
    if (kind === 'blocked') return 'approval'
    if (kind === 'aborted' || kind === 'error' || kind === 'max-tokens') return 'error'
    return null
  }
  if (event.type === 'approval/asked') return 'approval'
  if (event.type === 'tool/call') {
    const name = event.data && event.data.name
    if (name === 'ask_user_question') return 'approval'
  }
  return null
}

/**
 * Per-session notification state: an approval chime is played once per pending
 * decision (approval/asked rings; approval/decided clears; a later blocked
 * turn/end stays silent because the ring already happened).
 */
export function createSfxState() {
  const queue = []
  const awaitingApproval = new Map() // sessionId → true while a decided pair is open
  return {
    queue,
    handle(sessionId, event) {
      const scope = String(sessionId)
      if (event === null || typeof event !== 'object') return false
      if (event.type === 'approval/decided') {
        awaitingApproval.set(scope, false)
        return false
      }
      const type = classifySessionEvent(event)
      if (!type) return false
      if (event.type === 'approval/asked') {
        awaitingApproval.set(scope, true)
      }
      // A turn/end blocked right after an unanswered approval/asked must not
      // double-ring the confirmation sound.
      if (event.type === 'turn/end' && type === 'approval' && awaitingApproval.get(scope) === true) {
        return false
      }
      if (queue.length >= MAX_PENDING) return false
      queue.push({ type, sessionId: scope })
      return true
    },
    drain() {
      const items = queue.slice()
      queue.length = 0
      return items
    },
  }
}

// Prompt-sound policy (all plugin assets are served from the package, never
// copied): the bundled assets/sfx/<kind>.m4a clips are streamed by the /sfx
// route itself; a user file in ~/.dsh/dsh-tarkov/sounds/<kind>.<ext> overrides
// the bundled clip without touching it.

// User music lives in $DSH_HOME/dsh-tarkov/music; bundled tracks ship in
// assets/music and are served directly (never copied), so plugin upgrades
// update the built-in library automatically.
function ensureMusicDir() {
  try {
    fs.mkdirSync(MUSIC_DIR, { recursive: true })
  } catch (error) {
    console.error('dsh-theme-tarkov: music dir failed', error)
  }
}

// Desktop-pet data dirs: ~/.dsh/dsh-tarkov/voice for click-voice clips and
// ~/.dsh/dsh-tarkov/pet for a custom pet image (pet.png / pet.gif / …).
function ensurePetDirs() {
  try {
    fs.mkdirSync(VOICE_DIR, { recursive: true })
    fs.mkdirSync(PET_DIR, { recursive: true })
  } catch (error) {
    console.error('dsh-theme-tarkov: pet dirs failed', error)
  }
}

// Bundled voice library: every audio file in assets/pet/voice is served
// straight from the package (never copied to the user dir); users drop their
// own clips into ~/.dsh/dsh-tarkov/voice/ and they join the same random pool.
function listVoiceItems() {
  ensurePetDirs()
  const items = []
  for (const t of scanDir(ASSETS_VOICE)) items.push({ id: t.id, name: t.name, builtin: true })
  for (const t of scanDir(VOICE_DIR)) items.push({ id: t.id, name: t.name, builtin: false })
  return items
}

// Locate the camera-ready pet image: a user file in PET_DIR wins, otherwise
// the bundled altyn.png placeholder skin.
function resolvePetImage() {
  for (const ext of PET_IMAGE_EXTS) {
    const cand = path.join(PET_DIR, 'pet.' + ext)
    try {
      if (fs.statSync(cand).isFile()) return cand
    } catch (error) {
      /* not there */
    }
  }
  return path.join(ASSETS_PET, 'altyn.png')
}

// Stream one file with a length header; caller guarantees the path is safe.
function streamFile(full, res) {
  const stat = fs.statSync(full)
  if (!stat.isFile()) throw new Error('not a file')
  const ext = (path.extname(full) || '').slice(1).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': mime,
    'content-length': String(stat.size),
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=3600',
  })
  const stream = fs.createReadStream(full)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

const AUDIO_RE = /^(.+)\.([A-Za-z0-9]+)$/

// List audio files in one directory, fresh per call: cheap, and picks up files
// dropped in without a restart.
function scanDir(dir) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch (error) {
    return []
  }
  const list = []
  for (const name of names) {
    const match = AUDIO_RE.exec(name)
    if (!match || !MIME[match[2].toLowerCase()]) continue
    try {
      if (!fs.statSync(path.join(dir, name)).isFile()) continue
    } catch (error) {
      continue
    }
    list.push({ id: name, name: match[1] })
  }
  return list
}

// Combined library: bundled tracks (assets/music) first, then user files
// (MUSIC_DIR). Tracks are identified by base name (without extension), so a
// user file (e.g. track1.wav) shadows the bundled track with the same base
// name (track1.mp3) while still counting as builtin. Tracks the user deleted
// are recorded by base name in removedIds and excluded entirely. zh-CN name
// ordering for a stable picker order.
function listTracks(removedIds) {
  ensureMusicDir()
  const removed = new Set(Array.isArray(removedIds) ? removedIds : [])
  const builtinNames = new Set(scanDir(ASSETS_MUSIC).map((t) => t.name))
  const map = new Map()
  for (const t of scanDir(MUSIC_DIR)) {
    if (!removed.has(t.name)) map.set(t.name, { ...t, builtin: builtinNames.has(t.name) })
  }
  for (const t of scanDir(ASSETS_MUSIC)) {
    if (!removed.has(t.name) && !map.has(t.name)) map.set(t.name, { ...t, builtin: true })
  }
  const list = [...map.values()]
  list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return list
}

export const name = 'tarkov'
export const inject = ['webServer', 'fs']

export function apply(ctx) {
  ensurePetDirs()

  // Claim the Settings → Plugins → 插件配置 card seat: the browser half
  // registers settings.plugin.item keyed by this exact namespace and the tab
  // only dispatches registered namespaces. Empty schema — the real
  // configuration lives in this plugin's prefs.json and its own card.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, TarkovSettingsSchema)
  })

  let prefs = loadPrefs()
  const state = createSfxState()

  // Post-commit session-log firehose. Subagent sessions must not ring; the
  // listener stays mounted but short-circuits while the sfx feature is off
  // (route registration is what the "feature not loaded" promise covers).
  // It also paces the status-line copy: every completed step bumps statusSeq,
  // which the browser half polls so its entry rotates as work progresses. The
  // client has no session-event stream of its own, so the counter lives here.
  let statusSeq = 0
  ctx.on('session/event', (session, event) => {
    if (session === null || typeof session !== 'object') return
    if (session.header && session.header.origin === 'subagent') return
    if (event !== null && typeof event === 'object' && event.type === 'step/end') statusSeq += 1
    if (!prefs.sfx.enabled) return
    state.handle(session.id, event)
  })

  function sendJson(res, body, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  // Prompt sound for a kind: a user file SOUNDS_DIR/<kind>.<ext> wins (drop
  // one in to replace it), otherwise the bundled assets/sfx/<kind>.m4a is
  // served straight from the package. The bundle is never copied into the
  // user dir.
  function resolveSfx(kind) {
    try {
      for (const name of fs.readdirSync(SOUNDS_DIR)) {
        const dot = name.lastIndexOf('.')
        if (dot <= 0 || dot === name.length - 1) continue
        const base = name.slice(0, dot)
        const ext = name.slice(dot + 1).toLowerCase()
        if (base !== kind || !MIME[ext]) continue
        const full = path.join(SOUNDS_DIR, name)
        if (fs.statSync(full).isFile()) return { full, mime: MIME[ext] }
      }
    } catch (error) {
      /* no user dir yet */
    }
    const bundled = path.join(ASSETS_SFX, kind + '.m4a')
    if (fs.existsSync(bundled)) return { full: bundled, mime: 'audio/mp4' }
    return null
  }

  // ---- feature-gated route mounting --------------------------------------
  const routes = []
  function buildRoutes() {
    routes.length = 0
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/prefs',
      handler: (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          let body = ''
          let aborted = false
          req.on('data', (chunk) => {
            body += chunk
            if (body.length > 4 * 1024 * 1024) {
              aborted = true
              req.destroy()
            }
          })
          req.on('end', () => {
            if (aborted) return
            try {
              const parsed = JSON.parse(body)
              if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('prefs must be an object')
              prefs = sanitizePrefs(mergePrefs(prefs, parsed))
              savePrefs(prefs)
              applyRoutes()
              sendJson(res, { ok: true, prefs })
            } catch (error) {
              sendJson(res, { ok: false, error: String((error && error.message) || error) }, 400)
            }
          })
          req.on('error', () => { /* socket error */ })
          return
        }
        sendJson(res, { prefs })
      },
    })
    if (prefs.sfx.enabled) {
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/sfx-poll',
        handler: (req, res) => {
          sendJson(res, { items: state.drain() })
        },
      })
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/sfx',
        handler: (req, res) => {
          let id = ''
          try {
            id = new URL(req.url, 'http://dsh.local').searchParams.get('id') || ''
          } catch (error) {
            /* ignore */
          }
          if (!SFX_KINDS.includes(id)) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('bad id')
            return
          }
          try {
            const found = resolveSfx(id)
            if (found === null) throw new Error('no sound for ' + id)
            streamFile(found.full, res)
          } catch (error) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
          }
        },
      })
    }
    // Status-line copy pool. Always mounted (like the music library) so the
    // browser half can pick it up before any feature toggle is involved; read
    // fresh per request, so editing assets/status/*.txt needs no restart.
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/status-texts',
      handler: (req, res) => {
        sendJson(res, readStatusTexts())
      },
    })
    // Monotonic step counter for the status-line copy: the browser half polls
    // it and rotates its entry whenever the number moves.
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/status-poll',
      handler: (req, res) => {
        sendJson(res, { seq: statusSeq })
      },
    })
    // Music library routes stay available even while the feature is off so the
    // settings card can manage the library before enabling playback.
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/music',
      handler: (req, res) => {
        sendJson(res, { tracks: listTracks(prefs.music.removed), dir: MUSIC_DIR })
      },
    })
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/music/add',
      handler: (req, res) => {
        let name = ''
        try {
          name = new URL(req.url, 'http://dsh.local').searchParams.get('name') || ''
        } catch (error) {
          /* ignore */
        }
        const match = AUDIO_RE.exec(name)
        const ext = match ? match[2].toLowerCase() : ''
        if (!match || !MIME[ext] || name.includes('/') || name.includes('\\') || name.includes('..')) {
          sendJson(res, { ok: false, error: 'bad name' }, 400)
          return
        }
        ensureMusicDir()
        const target = path.join(MUSIC_DIR, name)
        const out = fs.createWriteStream(target)
        let size = 0
        let failed = false
        const abort = (status, message) => {
          if (failed) return
          failed = true
          out.destroy()
          try { fs.unlinkSync(target) } catch (error) { /* ignore */ }
          sendJson(res, { ok: false, error: message }, status)
        }
        req.on('data', (chunk) => {
          if (failed) return
          size += chunk.length
          if (size > MAX_MUSIC_BYTES) {
            abort(413, 'too large')
            return
          }
          out.write(chunk)
        })
        req.on('end', () => {
          if (failed) return
          out.end(() => {
            if (!failed) sendJson(res, { ok: true, track: { id: name, name: match[1], builtin: false } })
          })
        })
        req.on('error', () => abort(400, 'upload failed'))
        out.on('error', () => abort(500, 'write failed'))
      },
    })
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/music/delete',
      handler: (req, res) => {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          if (body.length > 64 * 1024) req.destroy()
        })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            const id = parsed && typeof parsed.id === 'string' ? parsed.id : ''
            if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
              sendJson(res, { ok: false, error: 'bad id' }, 400)
              return
            }
            // Bundled tracks cannot be removed from the package: record the
            // base name in prefs so the library drops the logical track (and
            // a same-base user copy, if any). The settings card offers a
            // one-click "restore deleted builtin tracks" clear.
            const nameMatch = AUDIO_RE.exec(id)
            const base = nameMatch ? nameMatch[1] : ''
            if (base && scanDir(ASSETS_MUSIC).some((t) => t.name === base)) {
              for (const t of scanDir(MUSIC_DIR)) {
                if (t.name === base) {
                  try { fs.unlinkSync(path.join(MUSIC_DIR, t.id)) } catch (error) { /* ignore */ }
                }
              }
              const removed = Array.from(new Set([...prefs.music.removed, base]))
              const disabled = prefs.music.disabled.filter((x) => !x.startsWith(base + '.'))
              prefs = sanitizePrefs(mergePrefs(prefs, { music: { removed, disabled } }))
              savePrefs(prefs)
              sendJson(res, { ok: true })
              return
            }
            const target = path.join(MUSIC_DIR, id)
            try {
              fs.unlinkSync(target)
            } catch (error) {
              sendJson(res, { ok: false, error: 'not found' }, 404)
              return
            }
            sendJson(res, { ok: true })
          } catch (error) {
            sendJson(res, { ok: false, error: String((error && error.message) || error) }, 400)
          }
        })
        req.on('error', () => { /* socket error */ })
      },
    })
    // ---- desktop pet routes (image / voice list / voice audio) ----
    // The voice list stays available while the feature is off so the client
    // can still report the directory hint; the image route must exist for the
    // pet to ever render, so both live together with the feature gate.
    if (prefs.pet.enabled) {
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/pet/voice',
        handler: (req, res) => {
          sendJson(res, { items: listVoiceItems(), dir: VOICE_DIR })
        },
      })
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/pet/audio',
        handler: (req, res) => {
          let id = ''
          let kind = 'user'
          try {
            const query = new URL(req.url, 'http://dsh.local').searchParams
            id = query.get('id') || ''
            kind = query.get('kind') || 'user'
          } catch (error) {
            /* ignore */
          }
          const idMatch = AUDIO_RE.exec(id)
          if (!idMatch || !MIME[idMatch[2].toLowerCase()] || id.includes('/') || id.includes('\\') || id.includes('..')) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('bad id')
            return
          }
          let full = null
          if (kind === 'builtin') {
            full = path.join(ASSETS_VOICE, id)
          } else if (kind === 'user') {
            full = path.join(VOICE_DIR, id)
          }
          if (full === null) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
            return
          }
          try {
            streamFile(full, res)
          } catch (error) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
          }
        },
      })
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/pet/image',
        handler: (req, res) => {
          try {
            streamFile(resolvePetImage(), res)
          } catch (error) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
          }
        },
      })
    }

    if (prefs.music.enabled) {
      routes.push({
        kind: 'exact',
        path: '/dsh-tarkov/audio',
        handler: (req, res) => {
          let id = ''
          try {
            id = new URL(req.url, 'http://dsh.local').searchParams.get('id') || ''
          } catch (error) {
            /* ignore */
          }
          if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('bad id')
            return
          }
          // User file wins over a bundled track with the same name.
          const userPath = path.join(MUSIC_DIR, id)
          const full = fs.existsSync(userPath) ? userPath : path.join(ASSETS_MUSIC, id)
          try {
            streamFile(full, res)
          } catch (error) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
          }
        },
      })
    }
  }

  let disposeRoutes = null
  function applyRoutes() {
    buildRoutes()
    disposeRoutes?.()
    const disposers = routes.map((route) => ctx.webServer.register(route))
    disposeRoutes = () => {
      for (const dispose of disposers) dispose()
    }
  }

  ctx.effect(() => {
    applyRoutes()
    return () => {
      disposeRoutes?.()
      disposeRoutes = null
    }
  }, 'dsh-theme-tarkov: routes')
}