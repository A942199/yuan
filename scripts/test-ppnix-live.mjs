import fs from 'node:fs'

const BASE = 'https://www.ppnix.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

const pages = [
  { type: 'movie', id: '8291' },
  { type: 'tv', id: '8272' },
]

const report = { started_at: new Date().toISOString(), pages: [], success: false }

async function fetchText(url, headers = {}, timeout = 15000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: ctl.signal })
    const text = await res.text()
    return { ok: res.ok, status: res.status, url: res.url, headers: Object.fromEntries(res.headers.entries()), text }
  } finally {
    clearTimeout(timer)
  }
}

function parseM3u8Values(html) {
  const m = html.match(/m3u8=\[([^\]]+)\]/)
  if (!m) return []
  return m[1].replace(/'/g, '').split(',').map(s => s.trim()).filter(Boolean)
}

function parseSubtitleLangs(html) {
  const m = html.match(/sub='\|([^|]*)\|([^|]*)\|([^|]*)\|'/)
  if (!m) return []
  return [m[1],m[2],m[3]].filter(Boolean)
}

function parseKeyUri(manifest) {
  const m = manifest.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/i)
  return m ? m[1] : ''
}

function firstMediaUri(manifest) {
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    return line
  }
  return ''
}

function resolve(base, relative) {
  try { return new URL(relative, base).toString() } catch { return '' }
}

for (const page of pages) {
  const row = { ...page, detail_url: `${BASE}/cn/${page.type}/${page.id}.html` }
  try {
    const detail = await fetchText(row.detail_url, HEADERS)
    row.detail_status = detail.status
    row.detail_content_type = detail.headers['content-type'] || ''
    row.detail_html_len = detail.text.length
    row.classid = (detail.text.match(/classid=(\d+)/) || [])[1] || ''
    row.values = parseM3u8Values(detail.text)
    row.subtitle_langs = parseSubtitleLangs(detail.text)
    row.has_m3u8_marker = detail.text.includes('m3u8=')
    row.has_sub_marker = detail.text.includes("sub='")

    if (!detail.ok || !row.values.length) {
      row.ok = false
      row.error = !detail.ok ? `detail_http_${detail.status}` : 'no_m3u8_values'
      report.pages.push(row)
      continue
    }

    const value = row.values[0]
    const manifestUrl = `${BASE}/info/m3u8/${page.id}/${encodeURIComponent(value)}.m3u8`
    row.manifest_url = manifestUrl
    const manifest = await fetchText(manifestUrl, { 'User-Agent': UA, Referer: `${BASE}/` })
    row.manifest_status = manifest.status
    row.manifest_content_type = manifest.headers['content-type'] || ''
    row.manifest_prefix = manifest.text.slice(0, 200)
    row.manifest_is_hls = /^#EXTM3U(?:\r?\n|$)/.test(manifest.text)

    const keyUri = parseKeyUri(manifest.text)
    row.key_uri = keyUri
    if (keyUri) {
      const keyUrl = resolve(manifestUrl, keyUri)
      row.key_url = keyUrl
      const key = await fetchText(keyUrl, { 'User-Agent': UA, Referer: `${BASE}/` })
      row.key_status = key.status
      row.key_content_type = key.headers['content-type'] || ''
      row.key_length = Buffer.byteLength(key.text)
    }

    const mediaUri = firstMediaUri(manifest.text)
    row.first_media_uri = mediaUri
    if (mediaUri) {
      const mediaUrl = resolve(manifestUrl, mediaUri)
      row.first_media_url = mediaUrl
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 15000)
      try {
        const res = await fetch(mediaUrl, {
          headers: { 'User-Agent': UA, Referer: manifestUrl, Range: 'bytes=0-4095' },
          redirect: 'follow', signal: ctl.signal,
        })
        row.media_status = res.status
        row.media_content_type = res.headers.get('content-type') || ''
        const buf = Buffer.from(await res.arrayBuffer())
        row.media_bytes = buf.length
        row.media_first_hex = buf.subarray(0, 16).toString('hex')
      } finally { clearTimeout(timer) }
    }

    row.ok = detail.ok && row.manifest_is_hls && row.manifest_status < 400 && (!mediaUri || row.media_status < 400)
    if (row.ok) report.success = true
  } catch (e) {
    row.ok = false
    row.error = String(e?.message || e)
  }
  report.pages.push(row)
}

report.finished_at = new Date().toISOString()
fs.writeFileSync('ppnix-live-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.success ? 0 : 1
