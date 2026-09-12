const fs = require('fs')
const vm = require('vm')
const axios = require('axios')
const cheerio = require('cheerio')

global.createCheerio = () => cheerio
global.argsify = (v) => {
  if (v == null || typeof v === 'object') return v
  return JSON.parse(String(v))
}
global.jsonify = (v) => JSON.stringify(v)
global.$print = (...v) => console.log('[SCRIPT]', ...v)

function responseHeaders(r) {
  if (!r || !r.headers) return {}
  if (typeof r.headers.toJSON === 'function') return r.headers.toJSON()
  return r.headers
}

global.$fetch = {
  get: async (url, options = {}) => {
    const r = await axios.get(url, {
      headers: options.headers || {},
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      responseType: 'text',
    })
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`GET ${r.status} ${url}: ${String(r.data).slice(0, 120)}`)
    }
    return { data: r.data, respHeaders: responseHeaders(r) }
  },
  post: async (url, body, options = {}) => {
    const r = await axios.post(url, body, {
      headers: options.headers || {},
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      transformResponse: [(data) => data],
    })
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`POST ${r.status} ${url}: ${String(r.data).slice(0, 120)}`)
    }
    return { data: r.data, respHeaders: responseHeaders(r) }
  },
}

const src = fs.readFileSync('js/anime1.js', 'utf8') + '\n;globalThis.__anime1={getCards,getTracks,getPlayinfo,search};'
vm.runInThisContext(src, { filename: 'anime1.js' })

;(async () => {
  const cards = JSON.parse(await __anime1.getCards(JSON.stringify({ page: 1 })))
  if (!cards.list || !cards.list.length) throw new Error('getCards returned empty list')
  console.log('CARDS', cards.list.length)

  let chosen = null
  let track = null
  for (const card of cards.list.slice(0, 12)) {
    const groups = JSON.parse(await __anime1.getTracks(JSON.stringify(card.ext || { id: card.vod_id })))
    const tracks = groups.list && groups.list[0] && groups.list[0].tracks
    if (tracks && tracks.length) {
      chosen = card
      track = tracks[0]
      console.log('CARD', card.vod_name, card.vod_id, 'TRACKS', tracks.length)
      break
    }
  }
  if (!chosen || !track) throw new Error('no playable Anime1 category found')
  console.log('TRACK', track.name, track.ext && track.ext.href)

  const play = JSON.parse(await __anime1.getPlayinfo(JSON.stringify(track.ext)))
  const url = play.urls && play.urls[0]
  if (!url) throw new Error('getPlayinfo returned no URL')
  const headers = (play.headers && play.headers[0]) || {}
  console.log('PLAY_URL', url)
  console.log('COOKIE_PRESENT', Boolean(headers.Cookie), 'COOKIE_LEN', headers.Cookie ? headers.Cookie.length : 0)
  if (!headers.Cookie) throw new Error('Anime1 playback cookie missing')
  if (!headers.Referer) throw new Error('Anime1 playback Referer missing')

  const media = await axios.get(url, {
    headers: { ...headers, Range: 'bytes=0-131071' },
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'arraybuffer',
  })
  const buf = Buffer.from(media.data)
  console.log('MEDIA_STATUS', media.status)
  console.log('MEDIA_TYPE', media.headers['content-type'])
  console.log('MEDIA_BYTES', buf.length)
  console.log('MEDIA_PREFIX_HEX', buf.subarray(0, 24).toString('hex'))
  if (![200, 206].includes(media.status)) throw new Error(`media HTTP ${media.status}`)
  if (buf.length < 4096) throw new Error(`media response too small: ${buf.length}`)

  // MP4 normally contains ftyp near the beginning; don't require byte zero because
  // some servers prepend a small box before it.
  const headAscii = buf.subarray(0, 128).toString('latin1')
  if (!headAscii.includes('ftyp') && !String(media.headers['content-type'] || '').includes('video')) {
    throw new Error('response does not look like MP4/video')
  }

  console.log('STRICT_ANIME1_TEST_PASS')
})().catch((e) => {
  console.error('STRICT_ANIME1_TEST_FAIL', e && e.stack ? e.stack : e)
  process.exit(1)
})
