import http from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const RELAY_TOKEN = String(process.env.RELAY_TOKEN || '').trim()
const STATIC_COOKIE = String(process.env.PPNIX_COOKIE || '').trim()
const UA = String(
  process.env.PPNIX_UA ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
)
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024)
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000)

const cookieJar = new Map()

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'ppnix.com' || host.endsWith('.ppnix.com')
}

function corsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Range,Referer,User-Agent,X-PPNIX-Relay-Token',
    'access-control-expose-headers': 'Content-Type,Content-Length,Content-Range,Accept-Ranges,ETag,Last-Modified',
    ...extra,
  }
}

function textResponse(res, status, text, extra = {}) {
  res.writeHead(status, corsHeaders({ 'content-type': 'text/plain; charset=utf-8', ...extra }))
  res.end(text)
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return `${proto}://${host}`
}

function cookieFor(hostname) {
  const dynamic = cookieJar.get(hostname) || ''
  return [STATIC_COOKIE, dynamic].filter(Boolean).join('; ')
}

function rememberSetCookies(hostname, headers) {
  let values = []
  try {
    if (typeof headers.getSetCookie === 'function') values = headers.getSetCookie()
  } catch {}
  if (!values.length) {
    const raw = headers.get('set-cookie')
    if (raw) values = [raw]
  }
  if (!values.length) return

  const pairs = []
  for (const raw of values) {
    const pair = String(raw || '').split(';')[0].trim()
    if (pair && pair.includes('=')) pairs.push(pair)
  }
  if (pairs.length) cookieJar.set(hostname, pairs.join('; '))
}

function upstreamHeaders(target, req) {
  const headers = {
    'user-agent': UA,
    accept: req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': req.headers['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8',
  }

  const referer = req.headers['x-ppnix-upstream-referer'] || req.headers.referer
  headers.referer = referer && /^https?:\/\//i.test(String(referer)) ? String(referer) : 'https://www.ppnix.com/'

  const range = req.headers.range
  if (range) headers.range = String(range)

  const cookie = cookieFor(target.hostname)
  if (cookie) headers.cookie = cookie

  return headers
}

async function fetchWithRedirects(targetUrl, req) {
  let current = new URL(targetUrl)
  for (let i = 0; i < 6; i++) {
    if (!isAllowedHost(current.hostname)) throw new Error(`blocked_redirect_host:${current.hostname}`)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response
    try {
      response = await fetch(current, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        redirect: 'manual',
        headers: upstreamHeaders(current, req),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    rememberSetCookies(current.hostname, response.headers)

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) return { response, finalUrl: current.toString() }
      current = new URL(location, current)
      continue
    }

    return { response, finalUrl: current.toString() }
  }
  throw new Error('too_many_redirects')
}

async function readLimited(response) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BODY) throw new Error('response_too_large')
      chunks.push(Buffer.from(value))
    }
  } finally {
    try { await reader.cancel() } catch {}
  }
  return Buffer.concat(chunks)
}

function relayUrl(origin, absoluteUrl) {
  return `${origin}/relay?url=${encodeURIComponent(absoluteUrl)}`
}

function rewritePlaylist(text, baseUrl, relayOrigin) {
  const wrap = (raw) => {
    const value = String(raw || '').trim()
    if (!value) return value
    let resolved
    try { resolved = new URL(value, baseUrl) } catch { return value }
    if (!isAllowedHost(resolved.hostname)) return resolved.toString()
    return relayUrl(relayOrigin, resolved.toString())
  }

  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line
      if (line.startsWith('#')) {
        return line.replace(/URI=("([^"]+)"|'([^']+)')/g, (_m, quoted, d1, d2) => {
          const q = quoted[0]
          return `URI=${q}${wrap(d1 || d2 || '')}${q}`
        })
      }
      return wrap(line)
    })
    .join('\n')
}

function copyResponseHeaders(upstream, extra = {}) {
  const out = {}
  for (const name of ['content-type', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range']) {
    const value = upstream.headers.get(name)
    if (value) out[name] = value
  }
  return corsHeaders({ ...out, ...extra })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    return res.end()
  }

  let parsed
  try { parsed = new URL(req.url || '/', requestOrigin(req)) } catch {
    return textResponse(res, 400, 'bad_request')
  }

  if (parsed.pathname === '/health') {
    return textResponse(res, 200, 'ok')
  }

  if (parsed.pathname !== '/relay') {
    return textResponse(res, 404, 'not_found')
  }

  if (RELAY_TOKEN && String(req.headers['x-ppnix-relay-token'] || '') !== RELAY_TOKEN) {
    return textResponse(res, 401, 'unauthorized')
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return textResponse(res, 405, 'method_not_allowed')
  }

  const targetRaw = String(parsed.searchParams.get('url') || '').trim()
  let target
  try { target = new URL(targetRaw) } catch {
    return textResponse(res, 400, 'invalid_url')
  }
  if (!/^https?:$/.test(target.protocol) || !isAllowedHost(target.hostname)) {
    return textResponse(res, 403, 'host_not_allowed')
  }

  try {
    const { response, finalUrl } = await fetchWithRedirects(target.toString(), req)
    if (req.method === 'HEAD') {
      res.writeHead(response.status, copyResponseHeaders(response))
      return res.end()
    }

    const body = await readLimited(response)
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const textLike = /(?:text\/|json|javascript|xml|mpegurl|m3u8|srt|vtt)/i.test(contentType)

    if (textLike) {
      const text = body.toString('utf8')
      const isHls = /^\s*#EXTM3U/m.test(text) || /mpegurl|m3u8/i.test(contentType)
      const output = isHls ? rewritePlaylist(text, finalUrl, requestOrigin(req)) : text
      const bytes = Buffer.from(output)
      res.writeHead(response.status, copyResponseHeaders(response, { 'content-length': String(bytes.length) }))
      return res.end(bytes)
    }

    res.writeHead(response.status, copyResponseHeaders(response, { 'content-length': String(body.length) }))
    return res.end(body)
  } catch (error) {
    const message = String(error?.message || error || 'relay_failed')
    return textResponse(res, 502, message.slice(0, 300))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ppnix-relay listening on :${PORT}`)
})
