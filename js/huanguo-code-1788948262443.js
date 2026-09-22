// 黄果短剧 huangguoai.com
// JSON 接口优先：首页 /api/home，分类 /api/videos/category/<id>，排行榜 /api/ranks/hot，
// 详情集数 /api/videos/<id>；接口失败时自动降级 HTML 刮削：
// 卡片 .hg-card-grid > .hg-drama-card；排行榜 .hg-rank-list > .hg-rank-item；
// 播放页 <script id="videoInitialData"> 内嵌 JSON，epPlaySrcs[集数] 直接给 m3u8。
// 封面图：CDN https://pic.tuafjz.cn，相对路径 /upload_01/...；带签名 URL（auth_key）保留 query。

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SITE = 'https://huangguoai.com'
const PIC_HOST = 'https://pic.tuafjz.cn'

const HEADERS = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: SITE + '/',
}

const TABS = [
    { name: '首页', id: 'home' },
    { name: 'AI成人短剧', id: 'ai-duanju' },
    { name: 'AI成人漫剧', id: 'ai-manju' },
    { name: 'AI换脸', id: 'ai-huanlian' },
    { name: 'AI魔改', id: 'ai-mogai' },
    { name: '排行榜', id: 'ranks/hot' },
]

// ---------- 工具 ----------
function fix(u) {
    if (!u) return ''
    if (u.indexOf('//') === 0) return 'https:' + u
    if (u.indexOf('/') === 0) return SITE + u
    return u
}

function absImage(u) {
    if (!u) return ''
    u = String(u).replace(/&amp;/g, '&')
    if (u.indexOf('http') === 0) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    if (u.indexOf('/') === 0) return PIC_HOST + u
    return u
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]*>/g, '')
        .trim()
}

async function fetchHtml(url, referer) {
    const headers = referer ? Object.assign({}, HEADERS, { Referer: referer }) : HEADERS
    let resp
    try {
        resp = await $fetch.get(url, { headers })
    } catch (e) {
        console.error('fetchHtml network error, retry once:', url, e && e.message)
        resp = await $fetch.get(url, { headers })
    }
    if (!resp || resp.status !== 200) {
        console.error('fetchHtml bad status:', url, resp && resp.status)
        return ''
    }
    const data = resp.data
    return typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data)
}

async function fetchJson(url, referer) {
    const text = await fetchHtml(url, referer)
    if (!text) throw new Error('empty response: ' + url)
    return JSON.parse(text)
}

function apiItem(it) {
    return {
        vod_id: String(it.id),
        vod_name: it.title,
        vod_pic: absImage(it.cover),
        vod_remarks: it.episode_count ? it.episode_count + '集全' : '',
        ext: { id: String(it.id) },
    }
}

function rankItem(it) {
    return {
        vod_id: String(it.video_id),
        vod_name: it.title,
        vod_pic: absImage(it.cover),
        vod_remarks: (it.tags || []).join(' · '),
        ext: { id: String(it.video_id) },
    }
}

// ---------- 卡片解析（HTML 兜底） ----------
function gridSlices(html, allGrids) {
    const re = /<div\s+class="[^"]*\bhg-card-grid\b[^"]*"[^>]*>/g
    const starts = []
    let m
    while ((m = re.exec(html)) !== null) starts.push(m.index + m[0].length)
    if (!starts.length) return []
    const slices = []
    const n = allGrids ? starts.length : Math.min(1, starts.length)
    for (let i = 0; i < n; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : html.length
        slices.push(html.slice(starts[i], to))
    }
    return slices
}

function cardBlocks(slice) {
    const re = /<div\s+class="[^"]*\bhg-drama-card\b[^"]*"[^>]*>/g
    const starts = []
    let m
    while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length)
    const blocks = []
    for (let i = 0; i < starts.length; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : slice.length
        blocks.push(slice.slice(starts[i], to))
    }
    return blocks
}

function parseCardBlock(block) {
    // 兼容结尾带斜杠或不带斜杠的 detail 链接
    const a = block.match(/href="[^"]*\/detail\/(\d+)\/?([^"]*)"/)
    if (!a) return null
    const vid = a[1]
    const imgM = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/)
    let title = ''
    const t = block.match(/hg-drama-card__title[^>]*>([\s\S]*?)<\/a>/)
    if (t) title = stripTags(t[1])
    if (!title) {
        const tt = block.match(/<a[^>]+href="[^"]*\/detail\/\d+\/?[^"]*"[^>]*>([\s\S]*?)<\/a>/)
        if (tt) title = stripTags(tt[1])
    }
    if (!title) return null
    const ep = block.match(/hg-drama-card__episode[^>]*>([\s\S]*?)<\/span>/)
    const score = block.match(/hg-drama-card__score[^>]*>([\s\S]*?)<\/span>/)
    const rem = ep ? ep[1].trim() : ''
    const sc = score ? score[1].trim() : ''
    let remarks = ''
    if (rem && sc) remarks = rem + ' · ' + sc
    else remarks = rem || sc
    return {
        vod_id: vid,
        vod_name: title,
        vod_pic: absImage(imgM ? imgM[1] : ''),
        vod_remarks: remarks,
        ext: { id: vid },
    }
}

function parseGridCards(html, allGrids) {
    if (!html) return []
    const list = []
    const seen = {}
    const slices = gridSlices(html, allGrids)
    for (const slice of slices) {
        for (const block of cardBlocks(slice)) {
            try {
                const item = parseCardBlock(block)
                if (!item || seen[item.vod_id]) continue
                seen[item.vod_id] = true
                list.push(item)
            } catch (e) {}
        }
    }
    return list
}

// ---------- 排行榜解析（HTML 兜底） ----------
function parseRanks(html) {
    if (!html) return []
    const listM = html.match(/<div\s+class="[^"]*\bhg-rank-list\b[^"]*"[^>]*>/)
    const from = listM ? listM.index + listM[0].length : 0
    const slice = html.slice(from)
    const re = /<div\s+class="[^"]*\bhg-rank-item\b[^"]*"[^>]*>/g
    const starts = []
    let m
    while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length)
    const list = []
    const seen = {}
    for (let i = 0; i < starts.length; i++) {
        const to = i + 1 < starts.length ? starts[i + 1] : slice.length
        const block = slice.slice(starts[i], to)
        try {
            const a = block.match(/href="[^"]*\/detail\/(\d+)\/?([^"]*)"/)
            if (!a || seen[a[1]]) continue
            seen[a[1]] = true
            const imgM = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/)
            let title = ''
            const t = block.match(/hg-rank-item__title[^>]*>([\s\S]*?)<\/h2>/)
            if (t) title = stripTags(t[1])
            if (!title) {
                const tt = block.match(/<a[^>]+href="[^"]*\/detail\/\d+\/?[^"]*"[^>]*>([\s\S]*?)<\/a>/)
                if (tt) title = stripTags(tt[1])
            }
            if (!title) continue
            const tags = block.match(/hg-rank-item__tags[^>]*>([\s\S]*?)<\/div>/)
            list.push({
                vod_id: a[1],
                vod_name: title,
                vod_pic: absImage(imgM ? imgM[1] : ''),
                vod_remarks: tags ? stripTags(tags[1]) : '',
                ext: { id: a[1] },
            })
        } catch (e) {}
    }
    return list
}

// ---------- 接口 ----------
async function getLocalInfo() {
    return jsonify({ ver: 1, name: '黄果短剧', api: 'csp_huangguo', type: 3 })
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '黄果短剧',
        site: SITE,
        tabs: TABS.map((t) => ({ name: t.name, ext: { id: t.id } })),
    })
}

async function getCards(ext) {
    ext = argsify(ext)
    const id = String(ext.id || 'home').replace(/^\//, '')
    const page = Math.max(1, parseInt(ext.page) || 1)
    const tab = TABS.filter((t) => t.id === id)[0]
    if (!tab) return jsonify({ list: [], page: page })
    try {
        if (id === 'home') {
            try {
                const data = (await fetchJson(SITE + '/api/home')).data
                const pool = [].concat(data.featured || [], data.latest || [])
                const seen = {}
                const list = []
                for (const it of pool) {
                    const key = String(it.id)
                    if (seen[key]) continue
                    seen[key] = true
                    list.push(apiItem(it))
                }
                if (list.length) return jsonify({ list: list, page: 1, over: true })
            } catch (e) {
                console.error('getCards home api fallback:', e && e.message)
            }
            const html = await fetchHtml(SITE + '/')
            return jsonify({ list: parseGridCards(html, true), page: 1, over: true })
        }
        if (id === 'ranks/hot') {
            try {
                const data = (await fetchJson(SITE + '/api/ranks/hot')).data
                const list = (data.items || []).map(rankItem)
                if (list.length) return jsonify({ list: list, page: 1, over: true })
            } catch (e) {
                console.error('getCards ranks api fallback:', e && e.message)
            }
            const html = await fetchHtml(SITE + '/ranks/hot/')
            return jsonify({ list: parseRanks(html), page: 1, over: true })
        }
        try {
            const res = await fetchJson(SITE + '/api/videos/category/' + id + '?page=' + page + '&size=21')
            const data = res.data || {}
            const pages = (data.pagination && data.pagination.pages) || 1
            const list = (data.items || []).map(apiItem)
            return jsonify({ list: list, page: page, over: page >= pages })
        } catch (e) {
            console.error('getCards category api fallback:', e && e.message)
        }
        const html = await fetchHtml(SITE + '/' + id + '/' + (page > 1 ? page + '/' : ''))
        return jsonify({ list: parseGridCards(html, false), page: page })
    } catch (e) {
        console.error('getCards error:', e)
        return jsonify({ list: [], page: page })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = String(ext.id || '')
    if (!/^\d+$/.test(id)) return jsonify({ list: [] })
    try {
        try {
            const data = (await fetchJson(SITE + '/api/videos/' + id)).data
            const tracks = []
            for (const ep of data.episodes || []) {
                const en = String(ep.ep_num)
                if (!/^\d+$/.test(en)) continue
                tracks.push({
                    name: ep.title || ('第' + en + '集'),
                    ext: { url: SITE + '/video/' + id + '/ep-' + en + '/', ep: en },
                })
            }
            if (tracks.length) return jsonify({ list: [{ title: '黄果短剧', tracks: tracks }] })
        } catch (e) {
            console.error('getTracks api fallback:', e && e.message)
        }
        // HTML 兜底：解析详情页集数
        const html = await fetchHtml(SITE + '/detail/' + id + '/')
        const tracks = []
        const are = /<a\b[^>]*\bdata-ep-id="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
        let m
        while ((m = are.exec(html)) !== null) {
            const eid = m[1]
            const tag = m[0]
            const hrefM = tag.match(/href="([^"]+)"/)
            if (!hrefM) continue
            const name = eid ? '第' + eid + '集' : stripTags(m[2])
            tracks.push({ name: name, ext: { url: fix(hrefM[1]), ep: eid } })
        }
        if (!tracks.length) {
            const playM = html.match(/<a\b[^>]*class="[^"]*\bhg-web-detail__play\b[^"]*"[^>]*href="([^"]+)"/)
            if (playM) {
                tracks.push({ name: '第1集', ext: { url: fix(playM[1]), ep: '1' } })
            }
        }
        if (!tracks.length) return jsonify({ list: [] })
        return jsonify({ list: [{ title: '黄果短剧', tracks: tracks }] })
    } catch (e) {
        console.error('getTracks error:', e)
        return jsonify({ list: [] })
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url || ''
    const ep = String(ext.ep || '1')
    if (!url) return jsonify({ urls: [] })
    try {
        const html = await fetchHtml(url, SITE)
        let play = ''
        const m = html.match(/id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/)
        if (m) {
            try {
                const data = JSON.parse(m[1])
                const srcs = (data && data.epPlaySrcs) || {}
                play = srcs[ep] || ''
            } catch (e) {}
        }
        if (play) {
            play = play.replace(/\\u0026/g, '&')
            if (play.indexOf('http') !== 0) {
                const mm = play.match(/(https?:\/\/[^\s"']+)/)
                play = mm ? mm[1] : ''
            }
        }
        if (!play) return jsonify({ urls: [] })
        return jsonify({
            urls: [play],
            headers: [{ 'User-Agent': UA, Referer: SITE + '/' }],
        })
    } catch (e) {
        console.error('getPlayinfo error:', e)
        return jsonify({ urls: [] })
    }
}

async function search(ext) {
    ext = argsify(ext)
    const kw = String(ext.text || ext.wd || '').trim()
    if (!kw) return jsonify({ list: [], page: 1 })
    try {
        const html = await fetchHtml(SITE + '/search/video/' + encodeURIComponent(kw) + '/')
        return jsonify({ list: parseGridCards(html, false), page: 1 })
    } catch (e) {
        console.error('search error:', e)
        return jsonify({ list: [], page: 1 })
    }
}