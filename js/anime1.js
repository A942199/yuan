const cheerio = createCheerio()

let UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20260913,
    title: 'anime1',
    site: 'https://anime1.me',
    tabs: [
        {
            id: '1',
            name: 'list',
            ext: {},
        },
    ],
}

function parseData(data) {
    if (data == null) return data
    if (typeof data === 'object') return data
    try {
        return argsify(data)
    } catch (_) {
        try {
            return JSON.parse(String(data))
        } catch (_) {
            return null
        }
    }
}

function absUrl(url, base = appConfig.site) {
    if (!url) return ''
    try {
        return new URL(url, base).toString()
    } catch (_) {
        if (url.startsWith('//')) return 'https:' + url
        return url
    }
}

function pageHeaders(referer) {
    const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    }
    if (referer) headers.Referer = referer
    return headers
}

function getHeaderValues(headers, target) {
    if (!headers) return []
    const key = Object.keys(headers).find((k) => k.toLowerCase() === target.toLowerCase())
    if (!key) return []
    const value = headers[key]
    if (Array.isArray(value)) return value.filter(Boolean).map(String)
    if (value == null) return []
    return [String(value)]
}

function splitSetCookieLine(line) {
    if (!line) return []
    // Split only at a comma followed by a new cookie-name=. This preserves
    // commas inside Expires=Wed, 21 Oct ...
    return String(line)
        .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/)
        .map((s) => s.trim())
        .filter(Boolean)
}

function buildCookie(response) {
    const headers = (response && (response.respHeaders || response.headers)) || {}
    const lines = []
    getHeaderValues(headers, 'set-cookie').forEach((line) => {
        splitSetCookieLine(line).forEach((v) => lines.push(v))
    })

    const seen = new Set()
    const pairs = []
    lines.forEach((line) => {
        const nv = line.split(';')[0].trim()
        const eq = nv.indexOf('=')
        if (eq <= 0) return
        const name = nv.slice(0, eq).trim()
        if (!name || seen.has(name)) return
        seen.add(name)
        pairs.push(nv)
    })
    return pairs.join('; ')
}

function isNoiseTitle(name) {
    const t = String(name || '').replace(/\s+/g, ' ').trim()
    if (!t) return true
    if (/^(動畫|动画)?列表$/.test(t)) return true
    if (/新番\s*$/.test(t)) return true
    if (/^(留言板|關於|关于|訂閱|订阅)/.test(t)) return true
    return false
}

function parseTracksFromHtml(html, tracks, seen) {
    const $ = cheerio.load(html)
    $('#main > article').each((_, e) => {
        const a = $(e).find('.entry-title a').first()
        const name = a.text().replace(/\s+/g, ' ').trim()
        const href = absUrl(a.attr('href'))
        if (!href || !name || seen.has(href)) return
        seen.add(href)
        tracks.push({
            name,
            pan: '',
            ext: { href },
        })
    })

    const pages = []
    $('.navigation.pagination a[href], .nav-links a[href]').each((_, e) => {
        const href = absUrl($(e).attr('href'))
        if (href && !pages.includes(href)) pages.push(href)
    })
    return pages
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const { page = 1 } = ext
    if (page > 1) return jsonify({ list: [] })

    try {
        const url = appConfig.site + '/animelist.json'
        const { data } = await $fetch.get(url, {
            headers: pageHeaders(appConfig.site + '/'),
        })

        const parsed = parseData(data)
        const cards = []
        if (Array.isArray(parsed)) {
            parsed.forEach((e) => {
                if (!Array.isArray(e)) return
                cards.push({
                    vod_id: `${e[0]}`,
                    vod_name: e[1] || '',
                    vod_pic: '',
                    vod_remarks: e[2] || '',
                    vod_pubdate: e[3] || '',
                    ext: { id: `${e[0]}` },
                })
            })
        }
        return jsonify({ list: cards })
    } catch (error) {
        $print(error)
        return jsonify({ list: [] })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const tracks = []
    const seen = new Set()
    const { id, href } = ext
    const firstUrl = href ? absUrl(href) : appConfig.site + `/?cat=${id}`

    try {
        const first = await $fetch.get(firstUrl, {
            headers: pageHeaders(appConfig.site + '/'),
        })
        const pages = parseTracksFromHtml(first.data, tracks, seen)

        // Fetch discovered WordPress pagination links. Limit requests to keep
        // this source responsive even for very long series.
        for (const pageUrl of pages.slice(0, 8)) {
            if (pageUrl === firstUrl) continue
            try {
                const pageRes = await $fetch.get(pageUrl, {
                    headers: pageHeaders(firstUrl),
                })
                parseTracksFromHtml(pageRes.data, tracks, seen)
            } catch (e) {
                $print(e)
            }
        }
    } catch (error) {
        $print(error)
    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const href = absUrl(ext.href)
    const api = 'https://v.anime1.me/api'

    try {
        if (!href) throw new Error('Anime1 episode URL is empty')

        const pageRes = await $fetch.get(href, {
            headers: pageHeaders(appConfig.site + '/'),
        })
        const $ = cheerio.load(pageRes.data)
        const apireq = (
            $('video[data-apireq]').first().attr('data-apireq') ||
            $('.video-js[data-apireq]').first().attr('data-apireq') ||
            $('.vjscontainer video').first().attr('data-apireq') ||
            ''
        ).trim()

        if (!apireq) throw new Error('Anime1 data-apireq not found')

        const apires = await $fetch.post(api, `d=${encodeURIComponent(apireq)}`, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                Origin: appConfig.site,
                Referer: href,
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
            },
        })

        const payload = parseData(apires.data)
        const sources = payload && Array.isArray(payload.s) ? payload.s : []
        let playUrl = sources[0] && sources[0].src ? String(sources[0].src) : ''
        if (!playUrl) throw new Error('Anime1 API returned no video source')
        playUrl = absUrl(playUrl, 'https://v.anime1.me/')

        const cookie = buildCookie(apires)
        const mediaHeaders = {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
            Accept: '*/*',
        }
        if (cookie) mediaHeaders.Cookie = cookie

        return jsonify({
            urls: [playUrl],
            headers: [mediaHeaders],
        })
    } catch (error) {
        $print(error)
        return jsonify({ urls: [] })
    }
}

async function search(ext) {
    ext = argsify(ext)
    const text = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    const url = `${appConfig.site}/page/${page}?s=${text}`
    const cards = []
    const seen = new Set()

    try {
        const { data } = await $fetch.get(url, {
            headers: pageHeaders(appConfig.site + '/'),
        })
        const $ = cheerio.load(data)

        $('#main > article').each((_, e) => {
            const cat = $(e).find('.entry-footer .cat-links a').first()
            const name = cat.text().replace(/\s+/g, ' ').trim()
            const href = absUrl(cat.attr('href'))
            if (!href || !name || isNoiseTitle(name) || seen.has(href)) return
            seen.add(href)

            const match = href.match(/[?&]cat=(\d+)/)
            const id = match ? match[1] : href
            cards.push({
                vod_id: id,
                vod_name: name,
                vod_pic: '',
                ext: {
                    id,
                    href,
                },
            })
        })
    } catch (error) {
        $print(error)
    }

    return jsonify({ list: cards })
}
