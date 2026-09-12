const CryptoJS = createCryptoJS()

// 感謝 小了白了兔
//源码来自https://raw.githubusercontent.com/Yswag/xptv-extensions/refs/heads/main/js/jpyy.js
//仅修改配置网址
//配置： {"site":"https://www.jiabaide.cn"}

const UA =
    // 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

let $config = argsify($config_str)
let appConfig = {
    ver: 1,
    title: '金牌影视',
    site: $config.site || 'https://www.jiabaide.cn',
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '电视剧', ext: { id: 2 } },
        { name: '综艺', ext: { id: 3 } },
        { name: '动漫', ext: { id: 4 } },
    ],
}

const FALLBACK_SITES = [
    'https://www.jiabaide.cn',
    'https://www.hkybqufgh.com',
    'https://www.sizhengxt.com',
    'https://www.sdzhgt.com',
    'https://m.9zhoukj.com',
    'https://m.cqzuoer.com',
    'https://www.hellosht52bwb.com',
    'https://hnytxj.com',
]

let activeSite = ''

function normalizeSite(site) {
    return String(site || '').trim().replace(/\/+$/, '')
}

function getCandidateSites() {
    const configured = String(appConfig.site || '')
        .split(',')
        .map(normalizeSite)
        .filter(Boolean)

    const all = configured.concat(FALLBACK_SITES.map(normalizeSite))
    return all.filter((site, index) => site && all.indexOf(site) === index)
}

async function signedGet(path, params = {}) {
    const rawQuery = toQueryString(params)
    const requestQuery = toQueryString(params, true)
    const suffix = requestQuery ? `?${requestQuery}` : ''
    const headers = getHeader(rawQuery)
    const sites = getCandidateSites()
    let lastError = null

    for (const site of sites) {
        try {
            const response = await $fetch.get(`${site}${path}${suffix}`, { headers })
            // API 正常时必须是 JSON；HTML/验证页/空响应自动尝试备用域名。
            if (typeof response?.data === 'string') {
                try {
                    JSON.parse(response.data)
                } catch (e) {
                    throw new Error('invalid_json_response')
                }
            }
            activeSite = site
            return { response, site }
        } catch (e) {
            lastError = e
        }
    }

    throw lastError || new Error('all_sites_failed')
}
const filterList = {
    1: [
        {
            key: 'type',
            name: '类型',
            value: [
                { n: '全部', v: '' },
                { n: '喜剧', v: '22' },
                { n: '动作', v: '23' },
                { n: '科幻', v: '30' },
                { n: '爱情', v: '26' },
                { n: '悬疑', v: '27' },
                { n: '奇幻', v: '87' },
                { n: '剧情', v: '37' },
                { n: '恐怖', v: '36' },
                { n: '犯罪', v: '35' },
                { n: '动画', v: '33' },
                { n: '惊悚', v: '34' },
                { n: '战争', v: '25' },
                { n: '冒险', v: '31' },
                { n: '灾难', v: '81' },
                { n: '伦理', v: '83' },
                { n: '其他', v: '43' },
            ],
        },
        {
            key: 'class',
            name: '剧情',
            value: [
                { n: '全部', v: '' },
                { n: '爱情', v: '爱情' },
                { n: '动作', v: '动作' },
                { n: '喜剧', v: '喜剧' },
                { n: '战争', v: '战争' },
                { n: '科幻', v: '科幻' },
                { n: '剧情', v: '剧情' },
                { n: '武侠', v: '武侠' },
                { n: '冒险', v: '冒险' },
                { n: '枪战', v: '枪战' },
                { n: '恐怖', v: '恐怖' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'area',
            name: '地区',
            value: [
                { n: '全部', v: '' },
                { n: '中国大陆', v: '中国大陆' },
                { n: '香港', v: '中国香港' },
                { n: '台湾', v: '中国台湾' },
                { n: '美国', v: '美国' },
                { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' },
                { n: '印度', v: '印度' },
                { n: '泰国', v: '泰国' },
                { n: '英国', v: '英国' },
                { n: '法国', v: '法国' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year',
            name: '年份',
            value: [
                { n: '全部', v: '' },
                { n: '2026', v: '2026' },
                { n: '2025', v: '2025' },
                { n: '2024', v: '2024' },
                { n: '2023', v: '2023' },
                { n: '2022', v: '2022' },
                { n: '2021', v: '2021' },
                { n: '2020', v: '2020' },
                { n: '2019', v: '2019' },
                { n: '2018', v: '2018' },
                { n: '2017', v: '2017' },
                { n: '2016', v: '2016' },
                { n: '2015', v: '2015' },
                { n: '2014', v: '2014' },
                { n: '2013', v: '2013' },
                { n: '2012', v: '2012' },
                { n: '2011', v: '2011' },
                { n: '2010', v: '2010' },
                { n: '2009~2000', v: '2009~2000' },
            ],
        },
        {
            key: 'lang',
            name: '语言',
            value: [
                { n: '全部', v: '' },
                { n: '国语', v: '国语' },
                { n: '英语', v: '英语' },
                { n: '粤语', v: '粤语' },
                { n: '韩语', v: '韩语' },
                { n: '日语', v: '日语' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最近更新', v: '2' },
                { n: '人气高低', v: '3' },
                { n: '评分高低', v: '4' },
            ],
        },
    ],
    2: [
        {
            key: 'type',
            name: '类型',
            value: [
                { n: '全部', v: '' },
                { n: '国产剧', v: '14' },
                { n: '欧美剧', v: '15' },
                { n: '港台剧', v: '16' },
                { n: '日韩剧', v: '62' },
                { n: '其他剧', v: '68' },
            ],
        },
        {
            key: 'class',
            name: '剧情',
            value: [
                { n: '全部', v: '' },
                { n: '古装', v: '古装' },
                { n: '战争', v: '战争' },
                { n: '喜剧', v: '喜剧' },
                { n: '家庭', v: '家庭' },
                { n: '犯罪', v: '犯罪' },
                { n: '动作', v: '动作' },
                { n: '奇幻', v: '奇幻' },
                { n: '剧情', v: '剧情' },
                { n: '历史', v: '历史' },
                { n: '短片', v: '短片' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'area',
            name: '地区',
            value: [
                { n: '全部', v: '' },
                { n: '中国大陆', v: '中国大陆' },
                { n: '香港', v: '中国香港' },
                { n: '台湾', v: '中国台湾' },
                { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' },
                { n: '美国', v: '美国' },
                { n: '泰国', v: '泰国' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year',
            name: '年份',
            value: [
                { n: '全部', v: '' },
                { n: '2026', v: '2026' },
                { n: '2025', v: '2025' },
                { n: '2024', v: '2024' },
                { n: '2023', v: '2023' },
                { n: '2022', v: '2022' },
                { n: '2021', v: '2021' },
                { n: '2020', v: '2020' },
                { n: '2019', v: '2019' },
                { n: '2018', v: '2018' },
                { n: '2017', v: '2017' },
                { n: '2016', v: '2016' },
                { n: '2015', v: '2015' },
                { n: '2014', v: '2014' },
                { n: '2013', v: '2013' },
                { n: '2012', v: '2012' },
                { n: '2011', v: '2011' },
                { n: '2010', v: '2010' },
            ],
        },
        {
            key: 'lang',
            name: '语言',
            value: [
                { n: '全部', v: '' },
                { n: '国语', v: '国语' },
                { n: '英语', v: '英语' },
                { n: '粤语', v: '粤语' },
                { n: '韩语', v: '韩语' },
                { n: '日语', v: '日语' },
                { n: '泰语', v: '泰语' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最近更新', v: '2' },
                { n: '人气高低', v: '3' },
                { n: '评分高低', v: '4' },
            ],
        },
    ],
    3: [
        {
            key: 'type',
            name: '类型',
            value: [
                { n: '全部', v: '' },
                { n: '国产综艺', v: '69' },
                { n: '港台综艺', v: '70' },
                { n: '日韩综艺', v: '72' },
                { n: '欧美综艺', v: '73' },
            ],
        },
        {
            key: 'class',
            name: '剧情',
            value: [
                { n: '全部', v: '' },
                { n: '真人秀', v: '真人秀' },
                { n: '音乐', v: '音乐' },
                { n: '脱口秀', v: '脱口秀' },
            ],
        },
        {
            key: 'area',
            name: '地区',
            value: [
                { n: '全部', v: '' },
                { n: '中国大陆', v: '中国大陆' },
                { n: '香港', v: '中国香港' },
                { n: '台湾', v: '中国台湾' },
                { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' },
                { n: '美国', v: '美国' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year',
            name: '年份',
            value: [
                { n: '全部', v: '' },
                { n: '2026', v: '2026' },
                { n: '2025', v: '2025' },
                { n: '2024', v: '2024' },
                { n: '2023', v: '2023' },
                { n: '2022', v: '2022' },
                { n: '2021', v: '2021' },
                { n: '2020', v: '2020' },
            ],
        },
        {
            key: 'lang',
            name: '语言',
            value: [
                { n: '全部', v: '' },
                { n: '国语', v: '国语' },
                { n: '英语', v: '英语' },
                { n: '粤语', v: '粤语' },
                { n: '韩语', v: '韩语' },
                { n: '日语', v: '日语' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最近更新', v: '2' },
                { n: '人气高低', v: '3' },
                { n: '评分高低', v: '4' },
            ],
        },
    ],
    4: [
        {
            key: 'type',
            name: '类型',
            value: [
                { n: '全部', v: '' },
                { n: '国产动漫', v: '75' },
                { n: '日韩动漫', v: '76' },
                { n: '欧美动漫', v: '77' },
            ],
        },
        {
            key: 'class',
            name: '剧情',
            value: [
                { n: '全部', v: '' },
                { n: '喜剧', v: '喜剧' },
                { n: '科幻', v: '科幻' },
                { n: '热血', v: '热血' },
                { n: '冒险', v: '冒险' },
                { n: '动作', v: '动作' },
                { n: '运动', v: '运动' },
                { n: '战争', v: '战争' },
                { n: '动画', v: '动画' },
            ],
        },
        {
            key: 'area',
            name: '地区',
            value: [
                { n: '全部', v: '' },
                { n: '中国大陆', v: '中国大陆' },
                { n: '日本', v: '日本' },
                { n: '美国', v: '美国' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year',
            name: '年份',
            value: [
                { n: '全部', v: '' },
                { n: '2026', v: '2026' },
                { n: '2025', v: '2025' },
                { n: '2024', v: '2024' },
                { n: '2023', v: '2023' },
                { n: '2022', v: '2022' },
                { n: '2021', v: '2021' },
                { n: '2020', v: '2020' },
                { n: '2019', v: '2019' },
                { n: '2018', v: '2018' },
                { n: '2017', v: '2017' },
                { n: '2016', v: '2016' },
                { n: '2015', v: '2015' },
                { n: '2014', v: '2014' },
                { n: '2013', v: '2013' },
                { n: '2012', v: '2012' },
                { n: '2011', v: '2011' },
                { n: '2010', v: '2010' },
            ],
        },
        {
            key: 'lang',
            name: '语言',
            value: [
                { n: '全部', v: '' },
                { n: '国语', v: '国语' },
                { n: '英语', v: '英语' },
                { n: '日语', v: '日语' },
                { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最近更新', v: '2' },
                { n: '人气高低', v: '3' },
                { n: '评分高低', v: '4' },
            ],
        },
    ],
}

async function getConfig() {
    return JSON.stringify(appConfig)
}

function parseExt(ext) {
    if (ext == null || ext === '') return {}
    if (typeof ext === 'string') {
        try {
            return JSON.parse(ext)
        } catch (e) {
            return {}
        }
    }
    return ext
}

function parseResponseData(raw) {
    let parsed = raw
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw)
        } catch (e) {
            return null
        }
    }
    if (!parsed || typeof parsed !== 'object') return null
    return parsed.data ?? null
}

function safeScore(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n.toFixed(1) : ''
}

function safeText(value) {
    return value == null ? '' : String(value)
}

function vodToCard(e) {
    if (!e || typeof e !== 'object') return null

    const id = e.vodId ?? e.vod_id ?? e.id
    const name = safeText(e.vodName ?? e.vod_name ?? e.name ?? e.title).trim()
    if (!id || !name || name.includes('预告')) return null

    const remarks = safeText(e.vodRemarks ?? e.vod_remarks)
    const version = safeText(e.vodVersion ?? e.vod_version)

    return {
        vod_id: String(id),
        vod_name: name,
        vod_pic: safeText(e.vodPic ?? e.vod_pic),
        vod_remarks: safeScore(e.vodDoubanScore ?? e.vod_douban_score),
        vod_duration: remarks.replace(/\|.*/, '') || version,
        vod_pubdate: safeText(e.vodPubdate ?? e.vod_pubdate ?? e.vodYear ?? e.vod_year),
        ext: { id: id },
    }
}

function toQueryString(obj, encodeValues = false) {
    return Object.keys(obj)
        .filter((k) => obj[k] != null && obj[k] !== '')
        .map((k) => {
            const value = String(obj[k])
            return `${k}=${encodeValues ? encodeURIComponent(value) : value}`
        })
        .join('&')
}

async function getCards(ext) {
    ext = parseExt(ext)
    const cards = []
    const { id, page = 1 } = ext

    const { type = '', class: v_class = '', area = '', year = '', lang = '', sort = '1' } = ext?.filters || {}

    const params = {
        area: area || '',
        filterStatus: '1',
        lang: lang || '',
        pageNum: page,
        pageSize: '30',
        sort: sort || '1',
        sortBy: '1',
        type: type || '',
        type1: id,
        v_class: v_class || '',
        year: year || '',
    }

    const { response } = await signedGet('/api/mw-movie/anonymous/video/list', params)
    const payload = parseResponseData(response?.data)
    const list = Array.isArray(payload?.list) ? payload.list : []

    list.forEach((e) => {
        const card = vodToCard(e)
        if (card) cards.push(card)
    })

    return JSON.stringify({ list: cards, filter: filterList[id] || [] })
}

async function getTracks(ext) {
    ext = parseExt(ext)

    const id = ext.id
    if (!id) return JSON.stringify({ list: [] })

    // 使用 JSON 详情接口，不再抓 m 站 HTML + 正则提取 episodeList。
    // 页面结构改变、Cloudflare HTML、换行等都不会再直接导致 match()[0] 崩溃。
    const params = { id: id }
    const { response } = await signedGet('/api/mw-movie/anonymous/video/detail', params)
    const detail = parseResponseData(response?.data) || {}

    const episodes = Array.isArray(detail.episodeList)
        ? detail.episodeList
        : Array.isArray(detail.episodelist)
          ? detail.episodelist
          : []

    const tracks = episodes
        .map((e, index) => {
            if (!e || e.nid == null) return null
            return {
                name: safeText(e.name).trim() || `第${index + 1}集`,
                ext: { id: id, nid: e.nid },
            }
        })
        .filter(Boolean)

    if (!tracks.length) return JSON.stringify({ list: [] })

    return JSON.stringify({ list: [{ title: '默认分组', tracks }] })
}

async function getPlayinfo(ext) {
    ext = parseExt(ext)
    const { id, nid } = ext
    if (!id || nid == null) return JSON.stringify({ urls: [] })

    // 当前站点实现需要 clientType=1。
    const params = {
        clientType: '1',
        id: id,
        nid: nid,
    }
    const { response, site } = await signedGet('/api/mw-movie/anonymous/v2/video/episode/url', params)
    const payload = parseResponseData(response?.data)
    const list = Array.isArray(payload?.list) ? payload.list : []

    const urls = list
        .map((item) => safeText(item?.url).trim())
        .filter((url) => /^https?:\/\//i.test(url))

    // myvideo 的 CSP 播放桥会把这里的 headers 带到媒体代理请求。
    const mediaSite = normalizeSite(site || activeSite || getCandidateSites()[0])
    const mediaHeaders = {
        'User-Agent': UA,
        Origin: mediaSite,
        Referer: mediaSite + '/',
    }

    return JSON.stringify({
        urls: urls,
        headers: mediaHeaders,
    })
}

async function search(ext) {
    ext = parseExt(ext)
    const cards = []

    const text = safeText(ext.text).trim()
    const page = Number(ext.page || 1) || 1
    if (!text) return JSON.stringify({ list: [] })

    // 新版接口使用 searchByWord + sourceCode=1。
    // 签名仍按未 URL 编码的参数值计算，请求 URL 再单独编码。
    const params = {
        keyword: text,
        pageNum: page,
        pageSize: '12',
        sourceCode: '1',
    }
    const { response } = await signedGet('/api/mw-movie/anonymous/video/searchByWord', params)
    const payload = parseResponseData(response?.data)

    const list = Array.isArray(payload?.result?.list)
        ? payload.result.list
        : Array.isArray(payload?.list)
          ? payload.list
          : []

    list.forEach((e) => {
        const card = vodToCard(e)
        if (card) cards.push(card)
    })

    return JSON.stringify({ list: cards })
}

function getHeader(queryOrUrl) {
    const signKey = 'cb808529bae6b6be45ecfab29a4889bc'
    const input = safeText(queryOrUrl)
    const dataStr = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input.replace(/^\?/, '')
    const t = Date.now()
    const signStr = dataStr + `&key=${signKey}` + `&t=${t}`

    function getUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0
            const v = c === 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
        })
    }

    return {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        deviceId: getUUID(),
        t: t.toString(),
        sign: CryptoJS.SHA1(CryptoJS.MD5(signStr).toString()).toString(),
    }
}
