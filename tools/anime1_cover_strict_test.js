const fs = require('fs')
const vm = require('vm')
const axios = require('axios')
const cheerio = require('cheerio')

const cache = new Map()
const client = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  validateStatus: () => true,
  responseType: 'text',
  transformResponse: [(data) => data],
})

function headersObject(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers || {})) out[k] = Array.isArray(v) ? v : String(v)
  return out
}

async function http(method, url, body, options = {}) {
  const res = await client.request({
    method,
    url,
    headers: options.headers || {},
    data: body,
  })
  const headers = headersObject(res.headers)
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`${method} ${res.status} ${url}: ${String(res.data || '').slice(0, 180)}`)
  }
  return { data: res.data, status: res.status, headers, respHeaders: headers }
}

const context = {
  console,
  URL,
  Promise,
  Set,
  Map,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  encodeURIComponent,
  decodeURIComponent,
  createCheerio: () => cheerio,
  argsify: (v) => {
    if (v == null || v === '') return {}
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch { return v }
    }
    return v
  },
  jsonify: (v) => v,
  $print: (...args) => console.log('[SCRIPT]', ...args.map(x => x && x.message ? x.message : x)),
  $cache: {
    get: (k) => cache.has(String(k)) ? cache.get(String(k)) : null,
    set: (k, v) => { cache.set(String(k), String(v == null ? '' : v)); return true },
    remove: (k) => cache.delete(String(k)),
  },
  $fetch: {
    get: (url, options) => http('GET', url, undefined, options),
    post: (url, body, options) => http('POST', url, body, options),
  },
}
context.globalThis = context
vm.createContext(context)
vm.runInContext(fs.readFileSync('js/anime1.js', 'utf8'), context, { filename: 'anime1.js' })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const page1 = await context.getCards({ page: 1 })
  const list1 = page1 && Array.isArray(page1.list) ? page1.list : []
  assert(list1.length > 0 && list1.length <= 20, `page1 size invalid: ${list1.length}`)
  const covered1 = list1.filter(x => x && /^https?:\/\//.test(String(x.vod_pic || '')))
  console.log('PAGE1', list1.length, 'COVERS', covered1.length)
  list1.slice(0, 8).forEach((x, i) => console.log('CARD', i + 1, x.vod_name, x.vod_pic || 'NO_PIC'))
  assert(covered1.length >= Math.min(5, list1.length), `too few covers: ${covered1.length}/${list1.length}`)

  const cover = covered1[0].vod_pic
  const imageRes = await axios.get(cover, {
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
  })
  const imageType = String(imageRes.headers['content-type'] || '')
  console.log('COVER_HTTP', imageRes.status, imageType, imageRes.data ? imageRes.data.byteLength : 0, cover)
  assert(imageRes.status >= 200 && imageRes.status < 300, `cover http ${imageRes.status}`)
  assert(imageType.startsWith('image/'), `cover content type ${imageType}`)
  assert(imageRes.data && imageRes.data.byteLength > 1024, 'cover image too small')

  const page2 = await context.getCards({ page: 2 })
  const list2 = page2 && Array.isArray(page2.list) ? page2.list : []
  const covered2 = list2.filter(x => x && /^https?:\/\//.test(String(x.vod_pic || '')))
  console.log('PAGE2', list2.length, 'COVERS', covered2.length)
  assert(list2.length > 0 && list2.length <= 20, `page2 size invalid: ${list2.length}`)
  assert(list1[0].vod_id !== list2[0].vod_id, 'pagination returned duplicate first card')
  assert(covered2.length >= Math.min(3, list2.length), `page2 too few covers: ${covered2.length}/${list2.length}`)

  const card = list1[0]
  const tracksResult = await context.getTracks(card.ext || { id: card.vod_id })
  const groups = tracksResult && Array.isArray(tracksResult.list) ? tracksResult.list : []
  const tracks = groups.flatMap(g => Array.isArray(g.tracks) ? g.tracks : [])
  assert(tracks.length > 0, 'no tracks')
  const track = tracks[0]
  console.log('TRACK', track.name, track.ext && track.ext.href)
  const play = await context.getPlayinfo(track.ext || {})
  const playUrl = play && Array.isArray(play.urls) ? play.urls[0] : ''
  const playHeaders = play && Array.isArray(play.headers) ? play.headers[0] || {} : {}
  assert(/^https?:\/\//.test(String(playUrl || '')), 'getPlayinfo returned no URL')
  console.log('PLAY_URL', playUrl)
  console.log('COOKIE_PRESENT', !!playHeaders.Cookie)
  assert(!!playHeaders.Cookie, 'Anime1 playback cookie missing')

  const media = await axios.get(playUrl, {
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'arraybuffer',
    headers: { ...playHeaders, Range: 'bytes=0-65535' },
  })
  console.log('MEDIA_STATUS', media.status, 'MEDIA_TYPE', media.headers['content-type'], 'MEDIA_BYTES', media.data ? media.data.byteLength : 0)
  assert(media.status === 206 || media.status === 200, `media status ${media.status}`)
  assert(media.data && media.data.byteLength > 4096, 'media body too small')
  console.log('STRICT_ANIME1_COVER_TEST_PASS')
})().catch((e) => {
  console.error('STRICT_ANIME1_COVER_TEST_FAIL', e && e.stack || e)
  process.exit(1)
})
