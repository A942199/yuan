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
  started_at: new Date().toISOString(), title: TITLE, host_attempts: [], search: null, detail: null,
  lines: [], success: false, playable_url: '', playable_line: '', accepted_variant: ''
}

function ts() { return Math.floor(Date.now() / 1000).toString() }
function appId() { return crypto.randomBytes(8).toString('hex') }
function form(obj) { return new URLSearchParams(Object.entries(obj).map(([k,v]) => [k, String(v)])).toString() }
function sign(params, token) {
  const s = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + `&token=${token}`
  return crypto.createHash('sha256').update(s).digest('hex')
}
function b64urlToBigInt(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '='
  return BigInt('0x' + Buffer.from(s,'base64').toString('hex'))
}
function modPow(base, exp, mod) {
  let r = 1n; base %= mod
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; exp >>= 1n; base = (base * base) % mod }
  return r
}
function publicDecryptSignedBlob(b64) {
  const jwk = crypto.createPublicKey(PUB_KEY).export({ format: 'jwk' })
  const n = b64urlToBigInt(jwk.n), e = b64urlToBigInt(jwk.e)
  const c = BigInt('0x' + Buffer.from(b64, 'base64').toString('hex'))
  const m = modPow(c, e, n), len = Math.ceil(n.toString(16).length / 2)
  const bytes = Buffer.from(m.toString(16).padStart(len * 2, '0'), 'hex')
  const sep = bytes.indexOf(0x00, 2)
  return (sep < 0 ? bytes : bytes.subarray(sep + 1)).toString('utf8').replace(/^\0+/, '')
}
async function rawFetch(url, init = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, redirect: 'follow' })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text, finalUrl: res.url }
  } finally { clearTimeout(timer) }
}
async function jsonFetch(url, init = {}) {
  const r = await rawFetch(url, init)
  if (!r.ok) throw new Error(`http_${r.status}:${r.text.slice(0,160)}`)
  return { data: JSON.parse(r.text), status: r.status, finalUrl: r.finalUrl }
}
async function postApi(host, path, params, token, id) {
  return postApiSplit(host, path, params, params, token, id)
}
async function postApiSplit(host, path, signParams, bodyParams, token, id) {
  const headers = {
    'User-Agent': UA, 'APP-ID': id, Authorization: '',
    'Content-Type': 'application/x-www-form-urlencoded', 'X-HASH-Data': sign(signParams, token)
  }
  return rawFetch(host + path, { method: 'POST', headers, body: form(bodyParams) })
}
async function postApiJson(host, path, params, token, id) {
  const r = await postApi(host, path, params, token, id)
  if (!r.ok) throw new Error(`http_${r.status}:${r.text.slice(0,160)}`)
  return { data: JSON.parse(r.text), status: r.status, finalUrl: r.finalUrl }
}
async function getToken(host, id) {
  const payload = { appID: id, timestamp: ts() }
  const r = await jsonFetch(host + '/vod-app/index/getGenerateKey', {
    method: 'POST', headers: {
      'User-Agent': UA, 'APP-ID': id, 'X-Auth-Flow': '1', 'Content-Type': 'application/x-www-form-urlencoded'
    }, body: form(payload)
  })
  if (!r.data?.data) throw new Error('token_missing_data')
  return publicDecryptSignedBlob(r.data.data).trim()
}
async function probe(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal, redirect: 'follow' })
    const reader = res.body?.getReader(); let first = Buffer.alloc(0)
    if (reader) { const chunk = await reader.read(); if (chunk.value) first = Buffer.from(chunk.value).subarray(0, 16384); try { await reader.cancel() } catch {} }
    const text = first.toString('utf8'), ct = res.headers.get('content-type') || ''
    const isHls = /^#EXTM3U/m.test(text) || /mpegurl/i.test(ct), isMedia = isHls || /^video\//i.test(ct)
    return { ok: res.ok && isMedia, status: res.status, content_type: ct, final_url: res.url, sample: text.slice(0,200), is_hls: isHls }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
  finally { clearTimeout(timer) }
}

let session = null
for (const host of HOSTS) {
  const id = appId()
  try { const token = await getToken(host, id); if (!token) throw new Error('empty_token'); report.host_attempts.push({ host, ok: true }); session = { host, id, token }; break }
  catch (e) { report.host_attempts.push({ host, ok: false, error: String(e?.message || e) }) }
}

try {
  if (!session) throw new Error('no_working_api_host')
  const { host, id, token } = session
  const searchParams = { key: TITLE, limit: '20', page: '1', timestamp: ts() }
  const searchRes = await postApiJson(host, '/vod-app/vod/segSearch', searchParams, token, id)
  const results = Array.isArray(searchRes.data?.data?.data) ? searchRes.data.data.data : []
  const chosen = results.find(x => String(x?.name || '').trim() === TITLE) || results[0]
  report.search = { count: results.length, chosen: chosen ? { id: chosen.id, name: chosen.name } : null }
  if (!chosen?.id) throw new Error('search_no_result')

  const detailParams = { tid: '', timestamp: ts(), vodId: String(chosen.id) }
  const detailRes = await postApiJson(host, '/vod-app/vod/info', detailParams, token, id)
  const sources = Array.isArray(detailRes.data?.data?.vodSources) ? detailRes.data.data.vodSources : []
  report.detail = { source_count: sources.length, sources: sources.map(s => ({ name: s?.sourceName, code: s?.sourceCode, episode_count: Array.isArray(s?.vodPlayList?.urls) ? s.vodPlayList.urls.length : 0 })) }
  if (!sources.length) throw new Error('detail_no_sources')

  const ordered = [...sources].sort((a,b) => (String(a?.sourceCode||'').toUpperCase()==='NBY'?1:0) - (String(b?.sourceCode||'').toUpperCase()==='NBY'?1:0) || Number(a?.sort||0)-Number(b?.sort||0))

  outer: for (const src of ordered) {
    const ep = Array.isArray(src?.vodPlayList?.urls) ? src.vodPlayList.urls[0] : null
    if (!ep?.url) continue
    const row = { name: src?.sourceName || '', code: src?.sourceCode || '', episode: ep?.name || '', raw_url: String(ep.url).slice(0,300), variants: [] }
    const stamp = ts(), encoded = encodeURIComponent(ep.url)
    const base = { sourceCode: src.sourceCode ?? '', timestamp: stamp }
    const variants = [
      { name: 'raw-sign_raw-body', signParams: { ...base, urlEncode: ep.url }, bodyParams: { ...base, urlEncode: ep.url } },
      { name: 'encoded-sign_encoded-body', signParams: { ...base, urlEncode: encoded }, bodyParams: { ...base, urlEncode: encoded } },
      { name: 'encoded-sign_raw-body', signParams: { ...base, urlEncode: encoded }, bodyParams: { ...base, urlEncode: ep.url } },
      { name: 'raw-sign_encoded-body', signParams: { ...base, urlEncode: ep.url }, bodyParams: { ...base, urlEncode: encoded } },
    ]

    for (const variant of variants) {
      const vr = { name: variant.name }
      try {
        const r = await postApiSplit(host, '/vod-app/vod/playUrl', variant.signParams, variant.bodyParams, token, id)
        vr.status = r.status; vr.response = r.text.slice(0,300)
        if (!r.ok) { row.variants.push(vr); continue }
        const j = JSON.parse(r.text), playUrl = String(j?.data?.url || '').trim()
        vr.play_url = playUrl.slice(0,500)
        if (!/^https?:\/\//i.test(playUrl)) { row.variants.push(vr); continue }
        const media = await probe(playUrl); vr.media = media; vr.ok = !!media.ok; row.variants.push(vr)
        if (media.ok) {
          row.ok = true; report.lines.push(row); report.success = true; report.playable_url = playUrl
          report.playable_line = `${row.name}(${row.code})`; report.accepted_variant = variant.name; break outer
        }
      } catch (e) { vr.error = String(e?.message || e); row.variants.push(vr) }
    }
    if (!row.ok) { row.ok = false; report.lines.push(row) }
  }
  if (!report.success) throw new Error('no_verified_playable_line')
} catch (e) { report.error = String(e?.message || e) }

report.finished_at = new Date().toISOString()
fs.writeFileSync('yiys-live-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ success: report.success, host: session?.host || '', search: report.search, accepted_variant: report.accepted_variant, playable_line: report.playable_line, playable_url: report.playable_url, error: report.error || '' }, null, 2))
process.exitCode = report.success ? 0 : 1
