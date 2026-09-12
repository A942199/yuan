const CryptoJS = createCryptoJS()

const UA = 'Android/OkHttp'
const SITE = 'https://aleig4ah.yiys05.com'
const FALLBACK_SITES = [
    SITE,
    SITE.replace(/^https:/i, 'http:'),
]
const PUB_KEY =
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4qpeOgv+MeXi57MVPqZF7SRmHR3FUelCTfrvI6vZ8kgTPpe1gMyP/8ZTvedTYjTDMqZBmn8o8Ym98yTx3zHaskPpmDR80e+rcRciPoYZcWNpwpFkrHp1l6Pjs9xHLXzf3U+N3a8QneY+jSMvgMbr00DC4XfvamfrkPMXQ+x9t3gNcP5YtuRhGFREBKP2q20gP783MCOBFwyxhZTIAsFiXrLkgZ97uaUAtqW6wtKR4HWpeaN+RLLxhBdnVjuMc9jaBl6sHMdSvTJgAajBTAd6LLA9cDmbGTxH7RGp//iZU86kFhxGl5yssZvBcx/K95ADeTmLKCsabexZVZ0Fu3dDQIDAQAB\n-----END PUBLIC KEY-----'

const APP_ID_CACHE_KEY = 'yiys_app_id'
const HOST_CACHE_KEY = 'yiys_working_host'

let host = SITE
let token = ''
let appId = ''

const filterList = {}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function textOf(value) {
    return value == null ? '' : String(value)
}

function errorText(error) {
    return textOf(error && error.message ? error.message : error)
}

function parseApiJson(resp, label) {
    if (!resp) throw new Error(`${label}_empty_response`)

    const status = Number(resp.status || 200)
    const raw = resp.data
    const text = typeof raw === 'string' ? raw.trim() : ''

    if (status >= 400) throw new Error(`${label}_http_${status}`)
    if (!text && (raw == null || raw === '')) throw new Error(`${label}_empty_body`)
    if (text && /^<!doctype|^<html/i.test(text)) throw new Error(`${label}_returned_html`)

    try {
        return typeof raw === 'string' ? JSON.parse(raw) : (raw || {})
    } catch (_) {
        throw new Error(`${label}_invalid_json`)
    }
}

function sha256(str) {
    return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex)
}

function genId() {
    const chars = '0123456789abcdef'
    let r = ''
    for (let i = 0; i < 16; i++) r += chars[Math.floor(Math.random() * 16)]
    return r
}

function cacheGet(key) {
    try {
        if (typeof $cache !== 'undefined' && $cache && typeof $cache.get === 'function') {
            return $cache.get(key)
        }
    } catch (_) {}
    return null
}

function cacheSet(key, value) {
    try {
        if (typeof $cache !== 'undefined' && $cache && typeof $cache.set === 'function') {
            $cache.set(key, value)
        }
    } catch (_) {}
}

function initAppId() {
    if (appId) return appId

    const saved = textOf(cacheGet(APP_ID_CACHE_KEY)).trim()
    if (/^[0-9a-f]{16}$/i.test(saved)) appId = saved

    if (!appId) {
        appId = genId()
        cacheSet(APP_ID_CACHE_KEY, appId)
    }

    return appId
}

function normalizeHost(value) {
    return textOf(value).trim().replace(/\/+$/, '')
}

function hostCandidates() {
    const out = []
    const push = (value) => {
        const normalized = normalizeHost(value)
        if (normalized && !out.includes(normalized)) out.push(normalized)
    }

    push(host)

    const cached = textOf(cacheGet(HOST_CACHE_KEY)).trim()
    if (/^https?:\/\//i.test(cached)) push(cached)

    for (const item of FALLBACK_SITES) push(item)
    return out
}

function setWorkingHost(value) {
    host = normalizeHost(value) || SITE
    cacheSet(HOST_CACHE_KEY, host)
}

function ts() {
    return Math.floor(Date.now() / 1000).toString()
}

function qs(obj) {
    return Object.keys(obj)
        .filter((k) => obj[k] != null)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])))
        .join('&')
}

function clonePayload(payload) {
    const next = { ...(payload || {}) }
    if (Object.prototype.hasOwnProperty.call(next, 'timestamp')) next.timestamp = ts()
    return next
}

// RSA public-key operation used by the app protocol.
function rsaPubDecrypt(b64Data) {
    try {
        const JSEncrypt = loadJSEncrypt()
        const crypt = new JSEncrypt()
        crypt.setPublicKey(PUB_KEY)
        const rsaKey = crypt.getKey()
        const BI = rsaKey.n.constructor

        const wa = CryptoJS.enc.Base64.parse(b64Data)
        let cipherHex = ''
        for (let i = 0; i < wa.sigBytes; i++) {
            const b = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
            cipherHex += ('0' + b.toString(16)).slice(-2)
        }

        const biCipher = new BI(cipherHex, 16)
        const biResult = rsaKey.doPublic(biCipher)

        const modHexLen = rsaKey.n.toString(16).length
        const modByteLen = Math.ceil(modHexLen / 2)
        let resultHex = biResult.toString(16)
        while (resultHex.length < modByteLen * 2) resultHex = '0' + resultHex

        const bytes = []
        for (let i = 0; i < resultHex.length; i += 2) {
            bytes.push(parseInt(resultHex.substring(i, i + 2), 16))
        }

        if (bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x01) {
            for (let j = 2; j < bytes.length; j++) {
                if (bytes[j] === 0x00) {
                    const msg = bytes.slice(j + 1)
                    let s = ''
                    for (let k = 0; k < msg.length; k++) s += String.fromCharCode(msg[k])
                    try {
                        return decodeURIComponent(escape(s))
                    } catch (_) {
                        return s
                    }
                }
            }
        }

        let start = 0
        while (start < bytes.length && bytes[start] === 0x00) start++
        const msg = bytes.slice(start)
        let s = ''
        for (let k = 0; k < msg.length; k++) s += String.fromCharCode(msg[k])
        try {
            return decodeURIComponent(escape(s))
        } catch (_) {
            return s
        }
    } catch (e) {
        console.log('RSA decrypt error:', errorText(e))
        return ''
    }
}

function computeHash(params) {
    const keys = Object.keys(params || {}).sort()
    const pairs = keys.map((k) => k + '=' + params[k])
    const full = pairs.join('&') + '&token=' + token
    return sha256(full)
}

function getHeaders(params) {
    initAppId()
    const h = {
        'User-Agent': UA,
        Connection: 'Keep-Alive',
        'APP-ID': appId,
        Authorization: '',
    }
    if (params) h['X-HASH-Data'] = computeHash(params)
    return h
}

async function fetchTokenFrom(base) {
    initAppId()
    const payload = { appID: appId, timestamp: ts() }
    const resp = await $fetch.post(base + '/vod-app/index/getGenerateKey', qs(payload), {
        headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Auth-Flow': '1',
        },
    })
    const json = parseApiJson(resp, 'token')
    if (!json || !json.data) throw new Error('token_missing_data')

    const nextToken = rsaPubDecrypt(json.data)
    if (!nextToken) throw new Error('token_decrypt_failed')

    token = nextToken
    setWorkingHost(base)
    return true
}

async function refreshToken() {
    token = ''
    const failures = []

    for (const base of hostCandidates()) {
        try {
            await fetchTokenFrom(base)
            return true
        } catch (e) {
            failures.push(base + '=' + errorText(e))
        }
    }

    throw new Error('token_all_hosts_failed:' + failures.join('|'))
}

async function apiRequest(method, path, payload, label) {
    initAppId()
    const failures = []

    for (const base of hostCandidates()) {
        try {
            if (!token || base !== host) await fetchTokenFrom(base)

            for (let attempt = 0; attempt < 2; attempt++) {
                const requestPayload = clonePayload(payload)
                try {
                    let resp
                    if (String(method).toUpperCase() === 'GET') {
                        resp = await $fetch.get(base + path + '?' + qs(requestPayload), {
                            headers: getHeaders(requestPayload),
                        })
                    } else {
                        resp = await $fetch.post(base + path, qs(requestPayload), {
                            headers: {
                                ...getHeaders(requestPayload),
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                        })
                    }

                    const json = parseApiJson(resp, label)
                    setWorkingHost(base)
                    return json
                } catch (e) {
                    if (attempt === 0) {
                        token = ''
                        await fetchTokenFrom(base)
                        await sleep(150)
                        continue
                    }
                    throw e
                }
            }
        } catch (e) {
            failures.push(base + '=' + errorText(e))
            if (base === host) token = ''
        }
    }

    throw new Error(label + '_all_hosts_failed:' + failures.join('|'))
}

async function ensureSession() {
    initAppId()
    if (!token) await refreshToken()
    return true
}

function toCard(v) {
    if (!v || v.id == null) return null
    return {
        vod_id: String(v.id),
        vod_name: textOf(v.name),
        vod_pic: textOf(v.vodPic),
        vod_remarks: textOf(v.vodRemarks),
        ext: { id: String(v.id) },
    }
}

async function getConfig() {
    await ensureSession()

    const json = await apiRequest('GET', '/vod-app/type/list', { timestamp: ts() }, 'config')
    if (!Array.isArray(json.data)) throw new Error('config_missing_data')

    const tabs = []
    for (const item of json.data) {
        if (!item || item.typeId == null) continue
        const tid = String(item.typeId)
        tabs.push({ name: textOf(item.typeName), ext: { id: tid } })

        const ext = item.type_extend_obj
        if (ext) {
            const filters = []
            const mkFilter = (key, name, str) => {
                const vals = [{ n: '全部', v: '' }]
                if (str) {
                    String(str).split(',').forEach((s) => {
                        s = s.trim()
                        if (s) vals.push({ n: s, v: s })
                    })
                }
                filters.push({ key, name, value: vals })
            }
            if (ext.class) mkFilter('classType', '类型', ext.class)
            if (ext.area) mkFilter('area', '地区', ext.area)
            if (ext.lang) mkFilter('lang', '语言', ext.lang)
            if (ext.year) mkFilter('year', '年份', ext.year)
            filters.push({
                key: 'sort',
                name: '排序',
                value: [
                    { n: '新上线', v: 'time' },
                    { n: '热播榜', v: 'hits_day' },
                    { n: '好评榜', v: 'score' },
                ],
            })
            if (filters.length) filterList[tid] = filters
        }
    }

    return jsonify({
        ver: 1,
        title: '意影视',
        site: host,
        tabs,
    })
}

async function getCards(ext) {
    await ensureSession()
    ext = argsify(ext) || {}
    const { id: tid, page = 1, filters = {} } = ext
    if (tid == null || tid === '') throw new Error('cards_missing_tid')

    const raw = {
        tid: String(tid),
        page: String(page),
        limit: '12',
        timestamp: ts(),
        classType: filters.classType || filters.class || '',
        area: filters.area || '',
        lang: filters.lang || '',
        year: filters.year || '',
        by: filters.sort || 'time',
    }
    const payload = {}
    for (const k of Object.keys(raw)) {
        if (raw[k] !== '' && raw[k] != null) payload[k] = raw[k]
    }

    const json = await apiRequest('POST', '/vod-app/vod/list', payload, 'cards')
    const data = json.data || {}
    const items = Array.isArray(data.data) ? data.data : []
    const list = items.map(toCard).filter(Boolean)

    return jsonify({
        list,
        page: Number(page) || 1,
        pagecount: Number(data.totalPageCount || 1),
        filter: filterList[String(tid)] || [],
    })
}

async function getTracks(ext) {
    await ensureSession()
    ext = argsify(ext) || {}
    const vodId = ext.vod_id || ext.id
    if (vodId == null || vodId === '') throw new Error('tracks_missing_vod_id')

    const payload = {
        tid: '',
        timestamp: ts(),
        vodId: String(vodId),
    }

    const json = await apiRequest('POST', '/vod-app/vod/info', payload, 'tracks')
    const data = json.data || {}
    const sources = Array.isArray(data.vodSources)
        ? data.vodSources.slice().sort((a, b) => Number(a?.sort || 0) - Number(b?.sort || 0))
        : []

    const list = []
    for (const src of sources) {
        if (!src) continue
        const urls = Array.isArray(src.vodPlayList?.urls) ? src.vodPlayList.urls : []
        const tracks = urls
            .filter((u) => u && u.url)
            .map((u, index) => ({
                name: textOf(u.name) || ('第' + (index + 1) + '集'),
                ext: { sourceCode: src.sourceCode, url: u.url },
            }))

        if (tracks.length) {
            list.push({ title: textOf(src.sourceName) || '默认线路', tracks })
        }
    }

    return jsonify({ list })
}

async function getPlayinfo(ext) {
    await ensureSession()
    ext = argsify(ext) || {}
    const sourceCode = ext.sourceCode
    const rawUrl = textOf(ext.url).trim()
    if (!rawUrl) throw new Error('play_missing_url')

    const payload = {
        sourceCode: sourceCode == null ? '' : sourceCode,
        timestamp: ts(),
        // Form encoding in qs() already performs URL encoding once.
        urlEncode: rawUrl,
    }

    try {
        const json = await apiRequest('POST', '/vod-app/vod/playUrl', payload, 'play')
        const playUrl = textOf(json?.data?.url).trim()

        if (/^https?:\/\//i.test(playUrl)) {
            return jsonify({
                urls: [playUrl],
                headers: { 'User-Agent': UA },
            })
        }
    } catch (e) {
        console.log('getPlayinfo api error:', errorText(e))
        if (!/^https?:\/\//i.test(rawUrl)) throw e
    }

    if (/^https?:\/\//i.test(rawUrl)) {
        return jsonify({
            urls: [rawUrl],
            headers: { 'User-Agent': UA },
        })
    }

    return jsonify({ urls: [] })
}

async function search(ext) {
    await ensureSession()
    ext = argsify(ext) || {}
    const text = textOf(ext.text || ext.wd || ext.keyword).trim()
    const page = Number(ext.page || 1) || 1
    if (!text) return jsonify({ list: [], page, pagecount: 1 })

    const payload = {
        key: text,
        limit: '20',
        page: String(page),
        timestamp: ts(),
    }

    const json = await apiRequest('POST', '/vod-app/vod/segSearch', payload, 'search')
    const data = json.data || {}
    const items = Array.isArray(data.data) ? data.data : []
    const list = items.map(toCard).filter(Boolean)

    return jsonify({
        list,
        page,
        pagecount: Number(data.totalPageCount || 1),
    })
}
