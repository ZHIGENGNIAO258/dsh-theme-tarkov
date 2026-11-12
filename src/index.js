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
const ASSETS_BG = path.join(__dirname, '..', 'assets', 'bg')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA_DIR = path.join(DSH_HOME, 'dsh-tarkov')
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds')
const MUSIC_DIR = path.join(DATA_DIR, 'music')
const VOICE_DIR = path.join(DATA_DIR, 'voice')
const PET_DIR = path.join(DATA_DIR, 'pet')
const BG_DIR = path.join(DATA_DIR, 'bg')
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json')
const PET_IMAGE_EXTS = ['png', 'gif', 'webp', 'jpg', 'jpeg']
// Background layer: muted looping square videos served straight from the
// package (clips.json) or from ~/.dsh/dsh-tarkov/bg/. The browser crops each
// clip to its per-clip 16:9 framing with object-view-box, then covers the
// viewport; the host only resolves ids and streams the files.
const BG_EXTS = ['webm', 'mp4']
// Status-line copy pool: plain text files shipped inside the package, read per
// request so editing them needs only a page refresh (no host restart). The
// browser half cannot touch the filesystem, so it fetches them through
// GET /dsh-tarkov/status-texts.
const ASSETS_STATUS = path.join(__dirname, '..', 'assets', 'status')
const STATUS_LANGS = ['zh', 'en']
const STATUS_TEXT_MAX = 200
const STATUS_POOL_MAX = 200
// Pending-chime queue cap. It is a burst guard for the host side only: the
// browser half drains the queue on every poll (2 s), so the cap bites only when
// more notifications pile up inside one poll window. Every failed tool call now
// rings (see createSfxState), and a single turn can log a dozen failures, so the
// cap must pass a realistic burst instead of silently eating it.
export const MAX_PENDING = 32
const MAX_MUSIC_BYTES = 200 * 1024 * 1024
const SFX_KINDS = ['done', 'approval', 'error', 'tool_error']
// Settings namespace: on the ≤0.1.6 line `settings.plugin.item` dispatched
// exactly the registered namespaces, so this name had to equal the card key in
// lib/client.js. From 0.1.7 the card is a `plugins.bundle.config` seat keyed by
// the package name and no namespace registry exists; the name is still
// registered on the older line, so it is kept for that path. The schema stays
// deliberately shallow — the real configuration lives in the plugin's
// prefs.json, and an empty section is enough to claim the card.
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
  webm: 'video/webm',
  mp4: 'video/mp4',
}

export const DEFAULT_PREFS = {
  banner: {
    enabled: true,
    text1: '注意！这是“Deepseek Harness”的Beta测试版本。',
    text2: 'Beta测试版本不代表本产品的最终质量。感谢您的理解和支持，祝你好运！',
    opacity: 0.85,
  },
  sfx: {
    enabled: true,
    volume: 70,
    // '' means the bundled seed sound; otherwise a { dataUrl, name } custom clip.
    sounds: { done: null, approval: null, error: null, tool_error: null },
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
    enabled: false,
    size: 112,
    volume: 70,
  },
  // Translucent video background. On by default: the shipped look is 救世主 at
  // a moderate veil. `opacity` is the alpha of the conversation-width plateau;
  // the tint fades to half that value at the viewport edges, so the sidebar
  // still shows the clip. `tone` darkens/brightens the tint only. `clip` is a
  // manifest id, 'auto' (first local file, else the first bundled clip), or
  // 'user:<file name>'; it is pinned to 'for-humanity' so a user's local files
  // cannot hijack the out-of-box look. `crops` holds one normalized 16:9
  // framing rect per clip and `perClip` the per-background opacity/tone/feather/
  // theme record. The top-level values remain the fallback for clips without a
  // record; `feather` is the fade width in vw (0..12).
  bg: {
    enabled: true,
    opacity: 42,
    tone: 0,
    feather: 6,
    clip: 'for-humanity',
    crops: {
      'for-humanity': { x: 0, y: 0.1449, w: 1, h: 0.5625 },
    },
    perClip: {
      'for-humanity': { opacity: 50, tone: 0, feather: 3, theme: 'light' },
      'and-survived': { opacity: 42, tone: 0, feather: 5, theme: 'dark' },
      'did-not-escape': { opacity: 42, tone: 0, feather: 5, theme: 'dark' },
      'fall-in-darkness': { opacity: 42, tone: 0, feather: 5, theme: 'dark' },
    },
  },
}

/**
 * Normalized 16:9 framing rect at the centre of a square source. Crops are
 * stored relative to the source (0..1), not in pixels, so the same value works
 * for every render size. `h = w * 9 / 16` is enforced.
 */
export const BG_DEFAULT_CROP = { x: 0, y: (1 - 9 / 16) / 2, w: 1, h: 9 / 16 }
const BG_MIN_CROP_W = 0.35
const BG_MANIFEST_FILE = path.join(ASSETS_BG, 'clips.json')
const BG_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Clamp one untrusted crop to a legal 16:9 rect. A missing/invalid value falls
 * back to {@link BG_DEFAULT_CROP}; a legal width is clamped so the rect still
 * fits inside the source. Pure so tests can pin the geometry.
 */
export function normalizeCrop(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...BG_DEFAULT_CROP }
  const n = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  let w = n(raw.w, BG_DEFAULT_CROP.w)
  w = Math.max(BG_MIN_CROP_W, Math.min(1, w))
  const h = (w * 9) / 16
  let x = n(raw.x, BG_DEFAULT_CROP.x)
  let y = n(raw.y, BG_DEFAULT_CROP.y)
  x = Math.max(0, Math.min(1 - w, x))
  y = Math.max(0, Math.min(1 - h, y))
  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    w: Math.round(w * 10000) / 10000,
    h: Math.round(h * 10000) / 10000,
  }
}

/** Validate the per-clip crop map. Keys are clip ids or `user:<file>`. */
export function sanitizeCrops(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (count >= 50) break
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) continue
    if (key.includes('/') || key.includes('\\') || key.includes('..')) continue
    out[key] = normalizeCrop(value)
    count += 1
  }
  return out
}

/**
 * Validate the per-background tuning map. A record may carry any subset of
 * `opacity` / `tone` / `theme`; missing fields fall back on the top-level
 * defaults in the client, which keeps older prefs working. Values outside
 * their range are dropped rather than clamped, so a corrupt entry never pins
 * the UI to an accidental extreme.
 */
export function sanitizePerClip(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (count >= 100) break
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) continue
    if (key.includes('/') || key.includes('\\') || key.includes('..')) continue
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const rec = {}
    if (typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 100) {
      rec.opacity = Math.round(value.opacity)
    }
    if (typeof value.tone === 'number' && Number.isFinite(value.tone) && value.tone >= -100 && value.tone <= 100) {
      rec.tone = Math.round(value.tone)
    }
    if (typeof value.feather === 'number' && Number.isFinite(value.feather) && value.feather >= 0 && value.feather <= 12) {
      rec.feather = Math.round(value.feather * 10) / 10
    }
    if (value.theme === 'light' || value.theme === 'dark' || value.theme === 'system') {
      rec.theme = value.theme
    }
    if (Object.keys(rec).length === 0) continue
    out[key] = rec
    count += 1
  }
  return out
}

/**
 * Merge a partial prefs patch field-wise over the current prefs, so the client
 * can PUT only what changed (e.g. { music: { trackId } }) without resending
 * the custom-sound dataUrls. Absent keys keep base values; explicit nulls stay.
 */
export function mergePrefs(base, patch) {
  const out = JSON.parse(JSON.stringify(base))
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return out
  for (const group of ['banner', 'sfx', 'music', 'pet', 'bg']) {
    const p = patch[group]
    if (p === null || typeof p !== 'object' || Array.isArray(p)) continue
    const baseCrops = group === 'bg' && out[group].crops && typeof out[group].crops === 'object' ? out[group].crops : null
    const basePerClip = group === 'bg' && out[group].perClip && typeof out[group].perClip === 'object' ? out[group].perClip : null
    out[group] = { ...out[group], ...p }
    if (group === 'sfx' && p.sounds && typeof p.sounds === 'object') {
      out.sfx.sounds = { ...out.sfx.sounds, ...p.sounds }
    }
    // Crops are keyed by clip id: a patch for one clip must not drop the rest.
    if (group === 'bg' && p.crops && typeof p.crops === 'object' && !Array.isArray(p.crops)) {
      out.bg.crops = { ...(baseCrops || {}), ...p.crops }
    }
    // Per-background tuning merges per key too, so writing one clip's record
    // (or one field of it) never discards another background's settings.
    if (group === 'bg' && p.perClip && typeof p.perClip === 'object' && !Array.isArray(p.perClip)) {
      const merged = { ...(basePerClip || {}) }
      for (const [key, value] of Object.entries(p.perClip)) {
        const prev = merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key]) ? merged[key] : {}
        if (value === null) {
          delete merged[key]
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          merged[key] = { ...prev, ...value }
        }
      }
      out.bg.perClip = merged
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
  const g = raw.bg
  if (g && typeof g === 'object') {
    if (typeof g.enabled === 'boolean') out.bg.enabled = g.enabled
    out.bg.opacity = num(g.opacity, 0, 100, out.bg.opacity)
    // `dim` was the one-directional scrim before `tone` replaced it: carry the
    // user's choice over as a darkening instead of silently resetting it.
    if (typeof g.tone === 'number') out.bg.tone = num(g.tone, -100, 100, out.bg.tone)
    else if (typeof g.dim === 'number') out.bg.tone = num(-g.dim, -100, 100, out.bg.tone)
    out.bg.feather = Math.round(num(g.feather, 0, 12, out.bg.feather) * 10) / 10
    if (typeof g.clip === 'string' && g.clip.length > 0 && g.clip.length <= 200 && !/[\\/]/.test(g.clip) && !g.clip.includes('..')) {
      out.bg.clip = g.clip
    }
    out.bg.crops = sanitizeCrops(g.crops)
    out.bg.perClip = sanitizePerClip(g.perClip)
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
 * tool/result carries `message.isError` — the same durable flag the harness's
 * own session telemetry reads — for a failed tool call (file not observed,
 * sandbox denied, provider error, timeout, ...).
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
  if (event.type === 'tool/result') {
    const data = event.data || {}
    const message = data.message
    if (message === null || typeof message !== 'object' || message.isError !== true) return null
    // A call the user cancelled, or one that never started, is not a failure
    // worth a sound: pressing Esc mid-turn must stay silent.
    const code = String((data.error && data.error.code) || '')
    if (code.startsWith('TOOL_ABORTED') || code === 'TOOL_NOT_STARTED' || code === 'TOOL_OUTCOME_UNKNOWN') return null
    return 'tool_error'
  }
  return null
}

/**
 * Per-session notification state: an approval chime is played once per pending
 * decision (approval/asked rings; approval/decided clears; a later blocked
 * turn/end stays silent because the ring already happened). A failed tool call
 * rings EVERY time: the harness can log a dozen failures inside one turn, and
 * collapsing them to a single chime — which is what this state machine used to
 * do — read as "the tool-failure chime only rings once per conversation". The
 * only limit left is the queue cap, a burst guard the browser half empties on
 * every poll.
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
      const data = (event.data !== null && typeof event.data === 'object') ? event.data : {}
      if (!type) return false
      // Mark the pending decision for the approval/asked pair AND for an
      // ask_user_question tool call: both pause the turn for a human answer, and
      // a turn that ends blocked while that answer is still owed must not ring a
      // second time.
      if (event.type === 'approval/asked' || (event.type === 'tool/call' && data.name === 'ask_user_question')) {
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

// Background library: bundled clips are described by assets/bg/clips.json and
// served straight from the package; user clips in ~/.dsh/dsh-tarkov/bg/ are
// listed alongside them. A clip id is either a manifest id or `user:<file>`.
function isSafeBgName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 && !/[\\/]/.test(name) && !name.includes('..')
}

/** Read and validate the bundled clip manifest. Always returns at least one clip. */
function loadBgManifest() {
  let parsed = null
  try {
    parsed = JSON.parse(fs.readFileSync(BG_MANIFEST_FILE, 'utf8'))
  } catch (error) {
    parsed = null
  }
  const list = []
  const seen = new Set()
  const entries = parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.clips) ? parsed.clips : []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.id !== 'string' || !BG_ID_RE.test(entry.id) || seen.has(entry.id)) continue
    if (!isSafeBgName(entry.file)) continue
    if (!BG_EXTS.includes((path.extname(entry.file).slice(1) || '').toLowerCase())) continue
    if (!fs.existsSync(path.join(ASSETS_BG, entry.file))) continue
    const poster = isSafeBgName(entry.poster) && fs.existsSync(path.join(ASSETS_BG, entry.poster)) ? entry.poster : null
    const names = entry.name !== null && typeof entry.name === 'object' ? entry.name : {}
    list.push({
      id: entry.id,
      file: entry.file,
      poster,
      name: {
        zh: typeof names.zh === 'string' && names.zh ? names.zh : entry.id,
        en: typeof names.en === 'string' && names.en ? names.en : entry.id,
      },
      scheme: entry.scheme === 'light' ? 'light' : 'dark',
      crop: normalizeCrop(entry.crop),
    })
    seen.add(entry.id)
  }
  if (list.length === 0) {
    // A broken/absent manifest must not kill the feature: keep the old clip.
    list.push({
      id: 'for-humanity',
      file: 'for-humanity.webm',
      poster: fs.existsSync(path.join(ASSETS_BG, 'for-humanity.jpg')) ? 'for-humanity.jpg' : null,
      name: { zh: '救世主', en: 'For Humanity' },
      scheme: 'light',
      crop: { ...BG_DEFAULT_CROP },
    })
  }
  return list
}

/** User clips, first by filename; ids are `user:<name>` so they never collide. */
function listUserBgFiles() {
  let names = []
  try {
    names = fs.readdirSync(BG_DIR)
  } catch (error) {
    return []
  }
  names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const out = []
  for (const name of names) {
    if (!isSafeBgName(name)) continue
    const dot = name.lastIndexOf('.')
    if (dot <= 0 || dot === name.length - 1) continue
    if (!BG_EXTS.includes(name.slice(dot + 1).toLowerCase())) continue
    const full = path.join(BG_DIR, name)
    try {
      if (!fs.statSync(full).isFile()) continue
    } catch (error) {
      continue
    }
    out.push({ id: 'user:' + name, name: name.slice(0, dot), builtin: false, scheme: null, poster: null, file: name })
  }
  return out
}

/** Resolve any accepted clip reference to a concrete id. */
function resolveBgClipId(clip) {
  const manifest = loadBgManifest()
  const users = listUserBgFiles()
  if (typeof clip === 'string') {
    if (clip.startsWith('user:') && users.some((entry) => entry.id === clip)) return clip
    if (BG_ID_RE.test(clip) && manifest.some((entry) => entry.id === clip)) return clip
  }
  if (users.length > 0) return users[0].id
  return manifest[0].id
}

/** Absolute path for a clip, or null when a `user:` reference no longer exists. */
function resolveBgClipPath(clip) {
  const id = resolveBgClipId(clip)
  if (id.startsWith('user:')) {
    const name = id.slice('user:'.length)
    if (!isSafeBgName(name)) return null
    return path.join(BG_DIR, name)
  }
  const entry = loadBgManifest().find((item) => item.id === id)
  return entry === undefined ? null : path.join(ASSETS_BG, entry.file)
}

/** Absolute poster path, or null for user clips without one. */
function resolveBgPosterPath(clip) {
  const id = resolveBgClipId(clip)
  if (id.startsWith('user:')) return null
  const entry = loadBgManifest().find((item) => item.id === id)
  return entry === undefined || entry.poster === null ? null : path.join(ASSETS_BG, entry.poster)
}

/**
 * Parse one HTTP byte-range header against a known size. Returns null when the
 * header is absent, or is not a single byte range this server handles (the
 * caller then sends the whole body), and 'invalid' when a well-formed range
 * cannot be satisfied (the caller answers 416).
 */
export function parseRange(header, size) {
  if (typeof header !== 'string' || header === '') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const rawStart = match[1]
  const rawEnd = match[2]
  if (rawStart === '' && rawEnd === '') return null
  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    if (suffix >= size) return size === 0 ? 'invalid' : { start: 0, end: size - 1 }
    start = size - suffix
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Number(rawEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid'
    if (end > size - 1) end = size - 1
  }
  if (size === 0 || start >= size || start > end) return 'invalid'
  return { start, end }
}

// Stream one file with a length header; caller guarantees the path is safe.
// A Range request (the browser asks for one whenever a <video> seeks or loops)
// is answered with 206 + content-range: a player that receives a 200 for
// `bytes=0-` re-downloads the whole clip on every loop.
function streamFile(full, res, req) {
  const stat = fs.statSync(full)
  if (!stat.isFile()) throw new Error('not a file')
  const ext = (path.extname(full) || '').slice(1).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const range = req === undefined || req === null ? null : parseRange(req.headers && req.headers.range, stat.size)
  const base = {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=3600',
  }
  if (range === 'invalid') {
    res.writeHead(416, { ...base, 'content-range': 'bytes */' + String(stat.size) })
    res.end()
    return
  }
  if (range !== null) {
    res.writeHead(206, {
      ...base,
      'content-length': String(range.end - range.start + 1),
      'content-range': 'bytes ' + String(range.start) + '-' + String(range.end) + '/' + String(stat.size),
    })
    const part = fs.createReadStream(full, { start: range.start, end: range.end })
    part.on('error', () => res.destroy())
    part.pipe(res)
    return
  }
  res.writeHead(200, { ...base, 'content-length': String(stat.size) })
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

  // Settings-page policy. Up to 0.1.6 the browser half's card lived in the
  // settings list keyed by this namespace, so the host had to register it; from
  // 0.1.7 that namespace registry is gone (the service carries only an
  // instance-level page policy) and the card ships from `plugins.bundle.config`
  // instead. The schema is empty either way — the real configuration lives in
  // this plugin's own prefs.json and its own card.
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings
    if (settings === null || typeof settings !== 'object') return
    if (typeof settings.register === 'function') settings.register(SETTINGS_NS, TarkovSettingsSchema)
    // `configure({ auto: false })` states that this plugin draws its own page,
    // so the settings surface offers no auto-generated form for an empty schema.
    if (typeof settings.configure === 'function') {
      settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber))
    }
  })

  let prefs = loadPrefs()
  const state = createSfxState()

  /** Per-clip framing rect: the user's saved one wins, else the manifest default. */
  function resolveBgCrop(clip) {
    const id = resolveBgClipId(clip)
    const stored = prefs.bg.crops[id]
    if (stored !== undefined) return normalizeCrop(stored)
    const entry = loadBgManifest().find((item) => item.id === id)
    return entry === undefined ? { ...BG_DEFAULT_CROP } : normalizeCrop(entry.crop)
  }

  /** Everything the settings card needs to draw the gallery. */
  function listBackgrounds() {
    const builtins = loadBgManifest().map((entry) => ({
      id: entry.id,
      name: entry.name,
      scheme: entry.scheme,
      builtin: true,
      file: entry.file,
      poster: entry.poster === null ? null : '/dsh-tarkov/bg/poster?id=' + encodeURIComponent(entry.id),
      crop: resolveBgCrop(entry.id),
    }))
    const users = listUserBgFiles().map((entry) => ({
      ...entry,
      poster: null,
      crop: resolveBgCrop(entry.id),
    }))
    return {
      clips: [...builtins, ...users],
      selected: resolveBgClipId(prefs.bg.clip),
      defaultCrop: { ...BG_DEFAULT_CROP },
      dir: BG_DIR,
    }
  }

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

    // ---- video background library ----
    // The list, posters and preview stay mounted while the feature is off: the
    // settings card must be able to browse/frame clips before enabling them.
    // The live clip route is gated, so "off" really means no video is fetched.
    // Both clip routes stream with byte-range support: a looping <video>
    // re-requests `bytes=0-` and must not re-download the file.
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/bg/list',
      handler: (req, res) => {
        sendJson(res, listBackgrounds())
      },
    })
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/bg/poster',
      handler: (req, res) => {
        let id = ''
        try {
          id = new URL(req.url, 'http://dsh.local').searchParams.get('id') || prefs.bg.clip
        } catch (error) {
          id = prefs.bg.clip
        }
        try {
          const full = resolveBgPosterPath(id)
          if (full === null) throw new Error('no poster')
          streamFile(full, res, req)
        } catch (error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('not found')
        }
      },
    })
    routes.push({
      kind: 'exact',
      path: '/dsh-tarkov/bg/preview',
      handler: (req, res) => {
        let id = ''
        try {
          id = new URL(req.url, 'http://dsh.local').searchParams.get('id') || prefs.bg.clip
        } catch (error) {
          id = prefs.bg.clip
        }
        try {
          const full = resolveBgClipPath(id)
          if (full === null) throw new Error('no clip')
          streamFile(full, res, req)
        } catch (error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('not found')
        }
      },
    })
    if (prefs.bg.enabled) {
      const streamClip = (req, res) => {
        let id = ''
        try {
          id = new URL(req.url, 'http://dsh.local').searchParams.get('id') || prefs.bg.clip
        } catch (error) {
          id = prefs.bg.clip
        }
        try {
          const full = resolveBgClipPath(id)
          if (full === null) throw new Error('no clip')
          streamFile(full, res, req)
        } catch (error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('not found')
        }
      }
      routes.push({ kind: 'exact', path: '/dsh-tarkov/bg/clip', handler: streamClip })
      // Compatibility with 0.3 clients/bookmarks: the selected clip.
      routes.push({ kind: 'exact', path: '/dsh-tarkov/bg', handler: streamClip })
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
  let appliedRouteKey = null
  function applyRoutes() {
    buildRoutes()
    // Crop/selection writes do not change the route set; re-registering them
    // would briefly unmount the always-on preview/list routes while the
    // framing editor is streaming. Handlers close over the live `prefs`, so an
    // unchanged path set can keep the existing registrations.
    const key = routes.map((route) => route.path).join('|')
    if (key === appliedRouteKey) return
    appliedRouteKey = key
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
      appliedRouteKey = null
    }
  }, 'dsh-theme-tarkov: routes')
}