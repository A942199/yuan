const CryptoJS = createCryptoJS()

const UA = 'Android/OkHttp'
const SITE = 'https://aleig4ah.yiys05.com'
const PUB_KEY =
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4qpeOgv+MeXi57MVPqZF7SRmHR3FUelCTfrvI6vZ8kgTPpe1gMyP/8ZTvedTYjTDMqZBmn8o8Ym98yTx3zHaskPpmDR80e+rcRciPoYZcWNpwpFkrHp1l6Pjs9xHLXzf3U+N3a8QneY+jSMvgMbr00DC4XfvamfrkPMXQ+x9t3gNcP5YtuRhGFREBKP2q20gP783MCOBFwyxhZTIAsFiXrLkgZ97uaUAtqW6wtKR4HWpeaN+RLLxhBdnVjuMc9jaBl6sHMdSvTJgAajBTAd6LLA9cDmbGTxH7RGp//iZU86kFhxGl5yssZvBcx/K95ADeTmLKCsabexZVZ0Fu3dDQIDAQAB\n-----END PUBLIC KEY-----'

const APP_ID_CACHE_KEY = 'yiys_app_id'

let host = SITE
let token = ''
let appId = ''

const filterList = {}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseApiJson(resp, label) {
    if (!resp) throw new Error(`${label}_empty_response`)
    const status = Number(resp.status || 200)
    const text = typeof resp.data === 'string' ? resp.data.trim() : ''
    if (status >= 400) throw new Error(`${label}_http_${status}`)
    if (text && /^</.test(text)) throw new Error(`${label}_returned_html`)
    try {
        return typeof resp.data === 'string' ? JSON.parse(resp.data) : (resp.data || {})
    } catch (error) {
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

function initAppId() {
    if (appId) return appId

    try {
        if (typeof $cache !== 'undefined' && $cache && typeof $cache.get === 'function') {
            const saved = String($cache.get(APP_ID_CACHE_KEY) || '').trim()
            if (/^[0-9a-f]{16}$/i.test(saved)) appId = saved
        }
    } catch (_) {}

    if (!appId) {
        appId = genId()
        try {
            if (typeof $cache !== 'undefined' && $cache && typeof $cache.set === 'function') {
                $cache.set(APP_ID_CACHE_KEY, appId)
            }
        } catch (_) {}
    }

    return appId
}

function ts() {
    return Math.floor(Date.now() / 1000).toString()
}

function qs(obj) {
    return Object.keys(obj)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]))
        .join('&')
}

// RSA public key decrypt using JSEncrypt
function rsaPubDecrypt(b64Data) {
    try {
        const JSEncrypt = loadJSEncrypt()
        const crypt = new JSEncrypt()
        crypt.setPublicKey(PUB_KEY)
        const rsaKey = crypt.getKey()
        const BI = rsaKey.n.constructor

        // Cipher bytes → hex → BigInteger
        const wa = CryptoJS.enc.Base64.parse(b64Data)
        let cipherHex = ''
        for (let i = 0; i < wa.sigBytes; i++) {
            const b = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
            cipherHex += ('0' + b.toString(16)).slice(-2)
        }

        const biCipher = new BI(cipherHex, 16)
        const biResult = rsaKey.doPublic(biCipher)

        // Pad result hex to modulus byte length (fix leading zeros)
        const modHexLen = rsaKey.n.toString(16).length
        const modByteLen = Math.ceil(modHexLen / 2)
        let resultHex = biResult.toString(16)
        while (resultHex.length < modByteLen * 2) resultHex = '0' + resultHex

        // Hex → bytes
        const bytes = []
        for (let i = 0; i < resultHex.length; i += 2) {
            bytes.push(parseInt(resultHex.substring(i, i + 2), 16))
        }

        // PKCS#1 v1.5 type 1 unpad: 00 01 ff...ff 00 <message>
        if (bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x01) {
            for (let j = 2; j < bytes.length; j++) {
                if (bytes[j] === 0x00) {
                    const msg = bytes.slice(j + 1)
                    let s = ''
                    for (let k = 0; k < msg.length; k++) s += String.fromCharCode(msg[k])
                    try {
                        return decodeURIComponent(escape(s))
                    } catch (e) {
                        return s
                    }
                }
            }
        }

        // Fallback: strip leading zeros
        let start = 0
        while (start < bytes.length && bytes[start] === 0x00) start++
        const msg = bytes.slice(start)
        let s = ''
        for (let k = 0; k < msg.length; k++) s += String.fromCharCode(msg[k])
        try {
            return decodeURIComponent(escape(s))
        } catch (e) {
            return s
        }
    } catch (e) {
        console.log('RSA decrypt error:', e.message || e)
        return ''
    }
}

function computeHash(params) {
    const keys = Object.keys(params).sort()
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

async function refreshToken() {
    initAppId()
    let lastError

    for (let attempt = 0; attempt < 2; attempt++) {
        const payload = { appID: appId, timestamp: ts() }

        try {
            const resp = await $fetch.post(host + '/vod-app/index/getGenerateKey', qs(payload), {
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
            return true
        } catch (e) {
            lastError = e
            token = ''
            console.log('refreshToken error:', e.message || e)
            if (attempt === 0) await sleep(350)
        }
    }

    if (lastError) console.log('refreshToken failed:', lastError.message || lastError)
    return false
}

async function ensureSession() {
    initAppId()
    if (token) return
    const ok = await refreshToken()
    if (!ok) throw new Error('token_unavailable')
}

async function apiReq(url, payload) {
    await ensureSession()

    let lastError
    let currentPayload = { ...(payload || {}) }

    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0 && Object.prototype.hasOwnProperty.call(currentPayload, 'timestamp')) {
            currentPayload = { ...currentPayload, timestamp: ts() }
        }

        try {
            const body = qs(currentPayload)
            const resp = await $fetch.post(url, body, {
                headers: {
                    ...getHeaders(currentPayload),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            })

            return parseApiJson(resp, 'api')
        } catch (error) {
            lastError = error

            if (attempt === 0) {
                token = ''
                const refreshed = await refreshToken()
                if (!refreshed) throw lastError
                await sleep(250)
                continue
            }
        }
    }

    throw lastError || new Error('api_unavailable')
}

async function getConfig() {
    await ensureSession()

    let json = {}
    let lastError

    for (let attempt = 0; attempt < 2; attempt++) {
        const params = { timestamp: ts() }

        try {
            const resp = await $fetch.get(host + '/vod-app/type/list?' + qs(params), {
                headers: getHeaders(params),
            })
            json = parseApiJson(resp, 'config')
            break
        } catch (error) {
            lastError = error

            if (attempt === 0) {
                token = ''
                const refreshed = await refreshToken()
                if (!refreshed) break
                await sleep(250)
            }
        }
    }

    if (!json.data) throw lastError || new Error('config_unavailable')

    const tabs = []
    const items = Array.isArray(json.data) ? json.data : []

    for (const item of items) {
        if (!item || item.typeId == null) continue

        const tid = item.typeId.toString()
        tabs.push({ name: item.typeName || tid, ext: { id: tid } })

        const ext = item.type_extend_obj
        if (ext) {
            const filters = []

            const mkFilter = (key, name, str) => {
                const vals = [{ n: '全部', v: '' }]
                if (str) {
                    str.split(',').forEach((s) => {
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

            if (filters.length > 0) filterList[tid] = filters
        }
    }

    return jsonify({
        ver: 1,
        title: '意影视',
        site: host,
        tabs: tabs,
    })
}

async function getCards(ext) {
    await ensureSession()
    ext = argsify(ext)

    const { id: tid, page = 1, filters = {} } = ext
    if (!tid) throw new Error('missing_type_id')

    try {
        const raw = {
            tid: tid,
            page: page,
            limit: '12',
            timestamp: ts(),
            classType: filters.classType || '',
            area: filters.area || '',
            lang: filters.lang || '',
            year: filters.year || '',
            by: filters.sort || 'time',
        }

        const payload = {}
        for (const k of Object.keys(raw)) {
            if (raw[k] !== '' && raw[k] != null) payload[k] = raw[k]
        }

        const json = await apiReq(host + '/vod-app/vod/list', payload)
        const data = json.data || {}
        const items = Array.isArray(data.data) ? data.data : []
        const totalPage = Number(data.totalPageCount || 1) || 1

        const list = items.map((v) => {
            if (!v || v.id == null) return null
            return {
                vod_id: v.id.toString(),
                vod_name: v.name || '',
                vod_pic: v.vodPic || '',
                vod_remarks: v.vodRemarks || '',
                ext: { id: v.id.toString() },
            }
        }).filter(Boolean)

        return jsonify({
            list: list,
            page: Number(page) || 1,
            pagecount: totalPage,
            filter: filterList[tid] || [],
        })
    } catch (e) {
        console.log('getCards error:', e.message || e)
        throw e
    }
}

async function getTracks(ext) {
    await ensureSession()
    ext = argsify(ext)

    const vodId = ext.vod_id || ext.id
    if (!vodId) throw new Error('missing_vod_id')

    try {
        const payload = {
            tid: '',
            timestamp: ts(),
            vodId: vodId.toString(),
        }

        const json = await apiReq(host + '/vod-app/vod/info', payload)
        const data = json.data || {}
        const sources = Array.isArray(data.vodSources)
            ? data.vodSources.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0))
            : []

        const list = []

        for (const src of sources) {
            const tracks = []
            const urls = src && src.vodPlayList && Array.isArray(src.vodPlayList.urls)
                ? src.vodPlayList.urls
                : []

            for (const u of urls) {
                if (!u || !u.url) continue
                tracks.push({
                    name: u.name || `第${tracks.length + 1}集`,
                    ext: {
                        sourceCode: src.sourceCode,
                        url: u.url,
                    },
                })
            }

            if (tracks.length > 0) {
                list.push({
                    title: src.sourceName || src.sourceCode || `线路${list.length + 1}`,
                    tracks: tracks,
                })
            }
        }

        return jsonify({ list: list })
    } catch (e) {
        console.log('getTracks error:', e.message || e)
        throw e
    }
}

async function getPlayinfo(ext) {
    await ensureSession()
    ext = argsify(ext)

    const { sourceCode, url: rawUrl } = ext
    if (!rawUrl) return jsonify({ urls: [] })

    let playUrl = ''

    try {
        // Do not pre-encode rawUrl here. apiReq() form-encodes the payload once.
        // Pre-encoding here and then calling qs() caused % to become %25 in myvideo.
        const payload = {
            sourceCode: sourceCode || '',
            timestamp: ts(),
            urlEncode: rawUrl,
        }

        const json = await apiReq(host + '/vod-app/vod/playUrl', payload)
        const data = json.data || {}
        playUrl = typeof data.url === 'string' ? data.url.trim() : ''
    } catch (e) {
        console.log('getPlayinfo error:', e.message || e)
    }

    const finalUrl = playUrl && /^https?:\/\//i.test(playUrl)
        ? playUrl
        : (/^https?:\/\//i.test(rawUrl) ? rawUrl : '')

    if (!finalUrl) return jsonify({ urls: [] })

    return jsonify({
        urls: [finalUrl],
        headers: {
            'User-Agent': UA,
        },
    })
}

async function search(ext) {
    await ensureSession()
    ext = argsify(ext)

    const { text, page = 1 } = ext
    const keyword = String(text || '').trim()
    if (!keyword) return jsonify({ list: [], page: 1, pagecount: 1 })

    try {
        const payload = {
            key: keyword,
            limit: '20',
            page: page.toString(),
            timestamp: ts(),
        }

        const json = await apiReq(host + '/vod-app/vod/segSearch', payload)
        const data = json.data || {}
        const items = Array.isArray(data.data) ? data.data : []
        const totalPage = Number(data.totalPageCount || 1) || 1

        const list = items.map((v) => {
            if (!v || v.id == null) return null
            return {
                vod_id: v.id.toString(),
                vod_name: v.name || '',
                vod_pic: v.vodPic || '',
                vod_remarks: v.vodRemarks || '',
                ext: { id: v.id.toString() },
            }
        }).filter(Boolean)

        return jsonify({
            list: list,
            page: Number(page) || 1,
            pagecount: totalPage,
        })
    } catch (e) {
        console.log('search error:', e.message || e)
        throw e
    }
}
