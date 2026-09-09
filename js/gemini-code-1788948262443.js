// 黄果短剧 huangguoai.com
// HTML 刮削源：首頁/分類/搜尋皆為 .hg-card-grid > .hg-drama-card 卡片；
// 排行榜為 .hg-rank-list > .hg-rank-item；詳情頁 .hg-web-detail__ep-grid 給集數；
// 播放頁 <script id="videoInitialData"> 內嵌 JSON，epPlaySrcs[集數] / videoSrc 直接給 m3u8。

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SITE = 'https://huangguoai.com'

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

function imgSrc(u) {
    u = fix(u || '')
    if (u.indexOf('http') === 0 && u.indexOf('?') !== -1) {
        u = u.replace(/\?.*/, '')
    }
    return u
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]*>/g, '')
        .trim()
}

async function fetchHtml(url, referer) {
    const headers = referer ? Object.assign({}, HEADERS, { Referer: referer }) : HEADERS
    const resp = await $fetch.get(url, { headers })
    const data = resp && resp.data
    return typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data)
}

// ---------- 卡片解析 ----------
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
        vod_pic: imgSrc(imgM ? imgM[1] : ''),
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

// ---------- 排行榜解析 ----------
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
                vod_pic: imgSrc(imgM ? imgM[1] : ''),
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
    try {
        if (id === 'home') {
            const html = await fetchHtml(SITE + '/')
            return jsonify({ list: parseGridCards(html, true), page: page })
        }
        const url = SITE + '/' + id + '/' + (page > 1 ? page + '/' : '')
        const html = await fetchHtml(url)
        if (id.indexOf('rank') !== -1) {
            return jsonify({ list: parseRanks(html), page: page })
        }
        return jsonify({ list: parseGridCards(html, false), page: page })
    } catch (e) {
        console.error('getCards error:', e)
        return jsonify({ list: [], page: page })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = ext.id || ''
    if (!id) return jsonify({ list: [] })
    try {
        const html = await fetchHtml(SITE + '/detail/' + id + '/')
        const tracks = []
        
        // 修正逻辑：改用全局查找所有 <a> 标签，防止由于 <div> 截断导致集数漏抓
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
        
        // 备用方案：如果未找到带有 data-ep-id 的 a 标签，再寻找播放入口
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
                // 增加针对数字/字符串 key 的兼容处理
                play = srcs[ep] || srcs[parseInt(ep)] || (data && data.videoSrc) || ''
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