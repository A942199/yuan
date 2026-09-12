import fs from 'node:fs'
import crypto from 'node:crypto'

const UA = 'Android/OkHttp'
const TITLE = process.env.YIYS_TEST_TITLE || '蜂鸟行动'
const HOSTS = [
  'https://otkxofv8.yiys08.com',
  'https://api2233.yiys06.com',
  'https://ws4afrx6.yiys06.com',
  'https://aleig4ah.yiys05.com',
]
const PUB_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4qpeOgv+MeXi57MVPqZF7SRmHR3FUelCTfrvI6vZ8kgTPpe1gMyP/8ZTvedTYjTDMqZBmn8o8Ym98yTx3zHaskPpmDR80e+rcRciPoYZcWNpwpFkrHp1l6Pjs9xHLXzf3U+N3a8QneY+jSMvgMbr00DC4XfvamfrkPMXQ+x9t3gNcP5YtuRhGFREBKP2q20gP783MCOBFwyxhZTIAsFiXrLkgZ97uaUAtqW6wtKR4HWpeaN+RLLxhBdnVjuMc9jaBl6sHMdSvTJgAajBTAd6LLA9cDmbGTxH7RGp//iZU86kFhxGl5yssZvBcx/K95ADeTmLKCsabexZVZ0Fu3dDQIDAQAB
-----END PUBLIC KEY-----`

const report = {
  started_at: new Date().toISOString(),
  title: TITLE,
  host_attempts: [],
  search: null,
  detail: null,
  lines: [],
  success: false,
  playable_url: '',
  playable_line: '',
}

function ts() { return Math.floor(Date.now() / 1000).toString() }
function appId() { return crypto.randomBytes(8).toString('hex') }
function form(obj) { return new URLSearchParams(Object.entries(obj).map(([k,v]) => [k, String(v)])).toString() }
function sign(params, token) {
  const s = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + `&token=${token}`
  return crypto.createHash('sha256').update(s).digest('hex')
}
function b64urlToBigInt(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/')
  while (s.length % 4) s += '='
  return BigInt('0x' + Buffer.from(s,'base64').toString('hex'))
}
function modPow(base, exp, mod) {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return r
}
function publicDecryptSignedBlob(b64) {
  const jwk = crypto.createPublicKey(PUB_KEY).export({ format: 'jwk' })
  const n = b64urlToBigInt(jwk.n)
  const e = b64urlToBigInt(jwk.e)
  const c = BigInt('0x' + Buffer.from(b64, 'base64').toString('hex'))
  const m = modPow(c, e, n)
  const len = Math.ceil(n.toString(16).length / 2)
  const hex = m.toString(16).padStart(len * 2, '0')
  const bytes = Buffer.from(hex, 'hex')
  const sep = bytes.indexOf(0x00, 2)
  if (sep < 0) return bytes.toString('utf8').replace(/^\0+/, '')
  return bytes.subarray(sep + 1).toString('utf8')
}
async function jsonFetch(url, init = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, redirect: 'follow' })
    const text = await res.text()
    if (!res.ok) throw new Error(`http_${res.status}:${text.slice(0,120)}`)
    const data = JSON.parse(text)
    return { data, status: res.status, finalUrl: res.url }
  } finally { clearTimeout(timer) }
}
async function postApi(host, path, params, token, id, extra = {}) {
  const headers = {
    'User-Agent': UA,
    'APP-ID': id,
    Authorization: '',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-HASH-Data': sign(params, token),
    ...extra,
  }
  return jsonFetch(host + path, { method: 'POST', headers, body: form(params) })
}
async function getToken(host, id) {
  const payload = { appID: id, timestamp: ts() }
  const r = await jsonFetch(host + '/vod-app/index/getGenerateKey', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'APP-ID': id,
      'X-Auth-Flow': '1',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form(payload),
  })
  if (!r.data?.data) throw new Error('token_missing_data')
  return publicDecryptSignedBlob(r.data.data).trim()
}
async function probe(url) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal, redirect: 'follow' })
    const reader = res.body?.getReader()
    let first = Buffer.alloc(0)
    if (reader) {
      const chunk = await reader.read()
      if (chunk.value) first = Buffer.from(chunk.value).subarray(0, 16384)
      try { await reader.cancel() } catch {}
    }
    const text = first.toString('utf8')
    const ct = res.headers.get('content-type') || ''
    const isHls = /^#EXTM3U/m.test(text) || /mpegurl/i.test(ct)
    const isMedia = isHls || /^video\//i.test(ct)
    return { ok: res.ok && isMedia, status: res.status, content_type: ct, final_url: res.url, sample: text.slice(0,200), is_hls: isHls }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  } finally { clearTimeout(timer) }
}

let session = null
for (const host of HOSTS) {
  const id = appId()
  try {
    const token = await getToken(host, id)
    if (!token) throw new Error('empty_token')
    report.host_attempts.push({ host, ok: true })
    session = { host, id, token }
    break
  } catch (e) {
    report.host_attempts.push({ host, ok: false, error: String(e?.message || e) })
  }
}

try {
  if (!session) throw new Error('no_working_api_host')
  const { host, id, token } = session

  const searchParams = { key: TITLE, limit: '20', page: '1', timestamp: ts() }
  const searchRes = await postApi(host, '/vod-app/vod/segSearch', searchParams, token, id)
  const results = Array.isArray(searchRes.data?.data?.data) ? searchRes.data.data.data : []
  const chosen = results.find(x => String(x?.name || '').trim() === TITLE) || results[0]
  report.search = { count: results.length, chosen: chosen ? { id: chosen.id, name: chosen.name } : null }
  if (!chosen?.id) throw new Error('search_no_result')

  const detailParams = { tid: '', timestamp: ts(), vodId: String(chosen.id) }
  const detailRes = await postApi(host, '/vod-app/vod/info', detailParams, token, id)
  const sources = Array.isArray(detailRes.data?.data?.vodSources) ? detailRes.data.data.vodSources : []
  report.detail = { source_count: sources.length, sources: sources.map(s => ({ name: s?.sourceName, code: s?.sourceCode, episode_count: Array.isArray(s?.vodPlayList?.urls) ? s.vodPlayList.urls.length : 0 })) }
  if (!sources.length) throw new Error('detail_no_sources')

  const ordered = [...sources].sort((a,b) => {
    const ap = String(a?.sourceCode || '').toUpperCase() === 'NBY' ? 1 : 0
    const bp = String(b?.sourceCode || '').toUpperCase() === 'NBY' ? 1 : 0
    return ap - bp || Number(a?.sort || 0) - Number(b?.sort || 0)
  })

  for (const src of ordered) {
    const ep = Array.isArray(src?.vodPlayList?.urls) ? src.vodPlayList.urls[0] : null
    if (!ep?.url) continue
    const row = { name: src?.sourceName || '', code: src?.sourceCode || '', episode: ep?.name || '', raw_url: String(ep.url).slice(0,300) }
    try {
      const playParams = { sourceCode: src.sourceCode ?? '', timestamp: ts(), urlEncode: ep.url }
      const playRes = await postApi(host, '/vod-app/vod/playUrl', playParams, token, id)
      const playUrl = String(playRes.data?.data?.url || '').trim()
      row.play_url = playUrl.slice(0,500)
      if (!/^https?:\/\//i.test(playUrl)) {
        row.ok = false; row.reason = 'no_http_play_url'; report.lines.push(row); continue
      }
      const media = await probe(playUrl)
      row.media = media
      row.ok = !!media.ok
      report.lines.push(row)
      if (media.ok) {
        report.success = true
        report.playable_url = playUrl
        report.playable_line = `${row.name}(${row.code})`
        break
      }
    } catch (e) {
      row.ok = false
      row.reason = String(e?.message || e)
      report.lines.push(row)
    }
  }

  if (!report.success) throw new Error('no_verified_playable_line')
} catch (e) {
  report.error = String(e?.message || e)
}

report.finished_at = new Date().toISOString()
fs.writeFileSync('yiys-live-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ success: report.success, host: session?.host || '', search: report.search, playable_line: report.playable_line, playable_url: report.playable_url, error: report.error || '' }, null, 2))
process.exitCode = report.success ? 0 : 1
