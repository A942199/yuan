// 拼鸡吉短剧 pinjiji.vip
// 数据源: pinjiji.vip JSON API (hgdj)
//   列表   GET  /api/sources/hgdj/list?category=%2Fai-duanju%2F[&cursor=<b64>]  无需 token
//   详情   GET  /api/sources/hgdj/detail?id=<id>                                无需 token
//   播放   POST /api/sources/hgdj/playback  {"data":{"id":"..","mediaId":"1"}} + Bearer token
//   匿名 token POST /api/user/anon {"data":{}} -> data.token (约 30 天, 过期自动重取)
// m3u8 链接带限时 auth_key, 每次播放实时经 playback 接口获取, 不复用旧链接
// 浏览器端已验证: 不登录可播放完整正片 (无截断预览)

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const BASE = 'https://pinjiji.vip'

const HEADERS = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: BASE + '/',
}

const TABS = [
    { name: '首页', id: 'home' },
    { name: 'AI短剧', id: 'ai-duanju' },
]

let TOKEN = ''

// ---------- 工具 ----------

function b64encode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let out = ''
    for (let i = 0; i < str.length; i += 3) {
        const c1 = str.charCodeAt(i)
        const c2 = str.charCodeAt(i + 1)
        const c3 = str.charCodeAt(i + 2)
        out += chars[c1 >> 2]
        out += chars[((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)]
        out += isNaN(c2) ? '=' : chars[((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6)]
        out += isNaN(c3) ? '=' : chars[c3 & 63]
    }
    return out
}

async function ensureToken() {
    if (TOKEN) {
        return true
    }
    if (typeof $fetch.post !== 'function') {
        return false
    }
    try {
        const resp = await $fetch.post(BASE + '/api/user/anon', JSON.stringify({ data: {} }), {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
                Referer: BASE + '/',
            },
        })
        const body = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
        const token = (body.data && body.data.token) || ''
        if (token) {
            TOKEN = token
            return true
        }
        console.error('[pinjiji] anon token 为空')
        return false
    } catch (e) {
        console.error('[pinjiji] 获取匿名 token 失败: ' + e)
        return false
    }
}

async function fetchJson(url, referer) {
    const resp = await $fetch.get(url, {
        headers: Object.assign({}, HEADERS, { Referer: referer }),
    })
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return { status: resp.status, data: JSON.parse(text) }
}

function categoryOf(id) {
    if (id === 'home') {
        return '/'
    }
    if (id === 'ai-duanju') {
        return '/ai-duanju/'
    }
    return null
}

// ---------- 接口 ----------

async function getLocalInfo() {
    return jsonify({ ver: 1, name: '拼鸡吉短剧', api: 'csp_pinjiji', type: 3 })
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '拼鸡吉短剧',
        site: BASE,
        tabs: TABS.map(t => ({ name: t.name, ext: { id: t.id } })),
    })
}

async function getCards(params) {
    params = argsify(params) || {}
    const ext = argsify(params.ext) || {}
    const id = String(params.id || ext.id || 'home')
    const page = Math.max(1, parseInt(params.page || ext.page, 10) || 1)
    const cat = categoryOf(id.replace(/^\//, ''))
    if (!cat) {
        return jsonify({ list: [], page: page, over: 1 })
    }
    try {
        let url = BASE + '/api/sources/hgdj/list?category=' + encodeURIComponent(cat)
        if (page > 1) {
            const scope = JSON.stringify({ operation: 'list', query: { category: cat }, source: 'hgdj' })
            const cursor = b64encode(JSON.stringify({ v: 1, scope: scope, page: page }))
            url = url + '&cursor=' + encodeURIComponent(cursor)
        }
        const r = await fetchJson(url, BASE + '/')
        if (r.status !== 200) {
            console.error('[pinjiji] 列表请求失败 status=' + r.status)
            return jsonify({ list: [], page: page, over: 1 })
        }
        const payload = r.data.data || r.data
        const items = (payload.items || []).map(it => ({
            vod_id: String(it.ref && it.ref.id),
            vod_name: it.title,
            vod_pic: BASE + (it.cover || ''),
            vod_remarks: it.label || '',
            ext: { id: String(it.ref && it.ref.id) },
        }))
        return jsonify({ list: items, page: page, over: payload.nextCursor ? 0 : 1 })
    } catch (e) {
        console.error('[pinjiji] getCards 失败: ' + e)
        return jsonify({ list: [], page: page, over: 1 })
    }
}

async function getTracks(params) {
    params = argsify(params) || {}
    const ext = argsify(params.ext) || {}
    const id = String(params.id || ext.id || '')
    if (!/^\d+$/.test(id)) {
        return jsonify({ list: [] })
    }
    try {
        const r = await fetchJson(BASE + '/api/sources/hgdj/detail?id=' + id, BASE + '/content/hgdj/' + id)
        if (r.status !== 200) {
            console.error('[pinjiji] 详情请求失败 status=' + r.status)
            return jsonify({ list: [] })
        }
        const payload = r.data.data || r.data
        const episodes = payload.episodes || []
        if (!episodes.length) {
            return jsonify({ list: [] })
        }
        const tracks = episodes.map(ep => ({
            name: ep.title || ('第' + (ep.media && ep.media.mediaId) + '集'),
            ext: { url: BASE + '/content/hgdj/' + id + '/', ep: String(ep.media && ep.media.mediaId) },
        }))
        return jsonify({ list: [{ title: '拼鸡吉', tracks: tracks }] })
    } catch (e) {
        console.error('[pinjiji] getTracks 失败: ' + e)
        return jsonify({ list: [] })
    }
}

async function getPlayinfo(params) {
    params = argsify(params) || {}
    const ext = argsify(params.ext) || {}
    const url = String(params.url || ext.url || '')
    const m = url.match(/\/content\/hgdj\/(\d+)/)
    if (!m) {
        return jsonify({ urls: [] })
    }
    const id = m[1]
    const ep = String(params.ep || ext.ep || '1')
    try {
        if (!(await ensureToken()) || typeof $fetch.post !== 'function' || !TOKEN) {
            return jsonify({ urls: [] })
        }
        const resp = await $fetch.post(
            BASE + '/api/sources/hgdj/playback',
            JSON.stringify({ data: { id: id, mediaId: ep } }),
            {
                headers: {
                    'User-Agent': UA,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                    'Authorization': 'Bearer ' + TOKEN,
                    Referer: BASE + '/content/hgdj/' + id,
                },
            }
        )
        const body = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
        const m3u8 = (body.data && body.data.url) || ''
        if (!m3u8) {
            console.error('[pinjiji] playback 未返回 m3u8')
            return jsonify({ urls: [] })
        }
        return jsonify({
            urls: [m3u8],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    } catch (e) {
        console.error('[pinjiji] getPlayinfo 失败: ' + e)
        return jsonify({ urls: [] })
    }
}

async function search() {
    return jsonify({ list: [], page: 1 })
}
