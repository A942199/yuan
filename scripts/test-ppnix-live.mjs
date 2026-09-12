import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HOSTS = ['https://www.ppnix.com', 'https://ppnix.com']
const PAGES = [
  { type: 'movie', id: '8291', title: '火遮眼' },
  { type: 'tv', id: '8272', title: '金特务：本色回归' },
]

const report = {
  started_at: new Date().toISOString(),
  runner: 'github-actions + curl -4',
  tests: [],
  success: false,
}

function curlText(url, headers = {}, maxTime = 35) {
  const args = [
    '-4', '-sS', '-L',
    '--connect-timeout', '10',
    '--max-time', String(maxTime),
    '--retry', '1',
    '--retry-delay', '1',
    '--retry-all-errors',
    '-A', UA,
  ]
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`)
  args.push('-w', '\n__PPNIX_META__%{http_code}|%{url_effective}|%{content_type}|%{remote_ip}', url)
  const out = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: (maxTime + 8) * 1000 })
  const stdout = out.stdout || ''
  const stderr = out.stderr || ''
  const marker = '\n__PPNIX_META__'
  const at = stdout.lastIndexOf(marker)
  const body = at >= 0 ? stdout.slice(0, at) : stdout
  const meta = at >= 0 ? stdout.slice(at + marker.length).trim() : ''
  const [statusRaw = '0', finalUrl = '', contentType = '', remoteIp = ''] = meta.split('|')
  return {
    exitCode: out.status,
    signal: out.signal,
    error: out.error ? String(out.error.message || out.error) : '',
    stderr: stderr.trim().slice(0, 500),
    status: Number(statusRaw) || 0,
    finalUrl,
    contentType,
    remoteIp,
    body,
  }
}

function curlBinary(url, headers = {}, maxTime = 35) {
  const file = `/tmp/ppnix-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  const args = [
    '-4', '-sS', '-L',
    '--connect-timeout', '10',
    '--max-time', String(maxTime),
    '--retry', '1',
    '--retry-delay', '1',
    '--retry-all-errors',
    '--range', '0-4095',
    '-A', UA,
  ]
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`)
  args.push('-o', file, '-w', '%{http_code}|%{url_effective}|%{content_type}|%{remote_ip}', url)
  const out = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: (maxTime + 8) * 1000 })
  let buf = Buffer.alloc(0)
  try { buf = fs.readFileSync(file) } catch {}
  try { fs.unlinkSync(file) } catch {}
  const [statusRaw = '0', finalUrl = '', contentType = '', remoteIp = ''] = String(out.stdout || '').trim().split('|')
  return {
    exitCode: out.status,
    signal: out.signal,
    error: out.error ? String(out.error.message || out.error) : '',
    stderr: String(out.stderr || '').trim().slice(0, 500),
    status: Number(statusRaw) || 0,
    finalUrl,
    contentType,
    remoteIp,
    bytes: buf.length,
    firstHex: buf.subarray(0, 24).toString('hex'),
  }
}

function parseM3u8Values(html) {
  const m = String(html || '').match(/m3u8=\[([^\]]+)\]/)
  if (!m) return []
  return m[1].replace(/'/g, '').split(',').map(s => s.trim()).filter(Boolean)
}

function parseKeyUri(manifest) {
  const m = String(manifest || '').match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/i)
  return m ? m[1] : ''
}

function firstMediaUri(manifest) {
  for (const raw of String(manifest || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    return line
  }
  return ''
}

function resolve(base, rel) {
  try { return new URL(rel, base).toString() } catch { return '' }
}

for (const base of HOSTS) {
  for (const page of PAGES) {
    const row = {
      base,
      type: page.type,
      id: page.id,
      title: page.title,
      detailUrl: `${base}/cn/${page.type}/${page.id}.html`,
      ok: false,
    }

    const detail = curlText(row.detailUrl, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }, 35)
    row.detail = {
      status: detail.status,
      finalUrl: detail.finalUrl,
      contentType: detail.contentType,
      remoteIp: detail.remoteIp,
      bytes: Buffer.byteLength(detail.body),
      exitCode: detail.exitCode,
      stderr: detail.stderr,
      hasM3u8Marker: detail.body.includes('m3u8='),
      titleSeen: detail.body.includes(page.title),
    }

    const values = parseM3u8Values(detail.body)
    row.values = values.slice(0, 8)
    if (detail.status < 200 || detail.status >= 400 || !values.length) {
      row.error = detail.status ? `detail_or_parse_failed_${detail.status}` : `detail_transport_failed_${detail.exitCode}`
      report.tests.push(row)
      continue
    }

    const value = values[0]
    const manifestUrl = `${base}/info/m3u8/${page.id}/${encodeURIComponent(value)}.m3u8`
    const manifest = curlText(manifestUrl, { Referer: `${base}/`, Accept: '*/*' }, 35)
    const manifestIsHls = manifest.body.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')
    row.manifest = {
      url: manifestUrl,
      status: manifest.status,
      finalUrl: manifest.finalUrl,
      contentType: manifest.contentType,
      remoteIp: manifest.remoteIp,
      bytes: Buffer.byteLength(manifest.body),
      exitCode: manifest.exitCode,
      stderr: manifest.stderr,
      isHls: manifestIsHls,
      prefix: manifest.body.slice(0, 220),
    }
    if (manifest.status < 200 || manifest.status >= 400 || !manifestIsHls) {
      row.error = manifest.status ? `manifest_invalid_${manifest.status}` : `manifest_transport_failed_${manifest.exitCode}`
      report.tests.push(row)
      continue
    }

    const keyUri = parseKeyUri(manifest.body)
    if (keyUri) {
      const keyUrl = resolve(manifest.finalUrl || manifestUrl, keyUri)
      const key = curlBinary(keyUrl, { Referer: manifest.finalUrl || manifestUrl, Accept: '*/*' }, 35)
      row.key = {
        url: keyUrl,
        status: key.status,
        finalUrl: key.finalUrl,
        contentType: key.contentType,
        remoteIp: key.remoteIp,
        bytes: key.bytes,
        firstHex: key.firstHex,
        exitCode: key.exitCode,
        stderr: key.stderr,
      }
      if (key.status < 200 || key.status >= 400 || key.bytes === 0) {
        row.error = `key_failed_${key.status || key.exitCode}`
        report.tests.push(row)
        continue
      }
    }

    const mediaUri = firstMediaUri(manifest.body)
    row.mediaUri = mediaUri
    if (!mediaUri) {
      row.error = 'no_media_uri'
      report.tests.push(row)
      continue
    }

    const mediaUrl = resolve(manifest.finalUrl || manifestUrl, mediaUri)
    const media = curlBinary(mediaUrl, { Referer: manifest.finalUrl || manifestUrl, Accept: '*/*' }, 35)
    row.media = {
      url: mediaUrl,
      status: media.status,
      finalUrl: media.finalUrl,
      contentType: media.contentType,
      remoteIp: media.remoteIp,
      bytes: media.bytes,
      firstHex: media.firstHex,
      exitCode: media.exitCode,
      stderr: media.stderr,
    }

    row.ok = media.status >= 200 && media.status < 400 && media.bytes > 0
    if (!row.ok) row.error = `media_failed_${media.status || media.exitCode}`
    if (row.ok) report.success = true
    report.tests.push(row)
  }
}

report.finished_at = new Date().toISOString()
fs.writeFileSync('ppnix-live-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.success ? 0 : 1
