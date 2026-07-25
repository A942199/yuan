const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.3'

let appConfig = {
    ver: 20260725,
    title: '愛壹帆',
    site: 'https://m10.iyf.tv',
    tabs: [
        {
            name: '电影',
            ext: {
                id: '3',
            },
        },
        {
            name: '电视',
            ext: {
                id: '4',
            },
        },
        {
            name: '综艺',
            ext: {
                id: '5',
            },
        },
        {
            name: '动漫',
            ext: {
                id: '6',
            },
        },
        {
            name: '短剧',
            ext: {
                id: '4,155',
            },
        },
        {
            name: '体育',
            ext: {
                id: '95',
            },
        },
        {
            name: '纪录片',
            ext: {
                id: '7',
            },
        },
    ],
}

async function getConfig() {
    await ensureKeys(true)
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const { publicKey } = await ensureKeys()
    let cards = []
    let { id, page = 1 } = ext

    let url = `${appConfig.site}/api/list/Search?cinema=1&page=${page}&size=36&orderby=0&desc=1&cid=0,1,${id}&isserial=-1&isIndex=-1&isfree=-1`
    let params = url.split('?')[1]
    url += `&vv=${getSignature(params)}&pub=${publicKey}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    const payload = argsify(data) || {}
    const list = payload.data?.info?.[0]?.result || []

    if (Array.isArray(list)) list.forEach((e) => {
        cards.push({
            vod_id: e.key,
            vod_name: e.title,
            vod_pic: e.image,
            vod_remarks: e.cid,
            ext: {
                key: e.key,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const { publicKey } = await ensureKeys()
    let tracks = []
    let key = ext.key

    let url = `${appConfig.site}/v3/video/languagesplaylist?cinema=1&vid=${key}&lsk=1&taxis=0&cid=0,1,4,133`
    let params = url.split('?')[1]
    url += `&vv=${getSignature(params)}&pub=${publicKey}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const payload = argsify(data) || {}
    const playlist = payload.data?.info?.[0]?.playList || []
    if (Array.isArray(playlist)) playlist.forEach((e) => {
        const name = e.name
        const key = e.key
        tracks.push({
            name: name,
            pan: '',
            ext: {
                key: key,
            },
        })
    })

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
    let key = ext.key
    if (!key) return jsonify({ urls: [] })

    // 播放接口偶尔返回空 info；每次重试都刷新密钥和签名。
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const { publicKey } = await ensureKeys(attempt > 0)
            let url = `${appConfig.site}/v3/video/play?cinema=1&id=${key}&a=0&lang=none&usersign=1&region=GL.&device=1&isMasterSupport=1`
            const params = url.split('?')[1]
            url += `&vv=${getSignature(params)}&pub=${publicKey}`

            const { data } = await $fetch.get(url, {
                headers: {
                    'User-Agent': UA,
                    Referer: `${appConfig.site}/`,
                },
            })

            const payload = argsify(data) || {}
            const info = payload.data?.info?.[0] || {}
            let paths = Array.isArray(info.flvPathList) ? info.flvPathList.slice() : []

            if (paths.length === 0 && Array.isArray(info.clarity)) {
                paths = info.clarity
                    .map((item) => item?.path || item)
                    .filter(Boolean)
                    .map((result) => ({ result, isHls: String(result).includes('.m3u8') }))
            }

            const candidate =
                paths.find((item) => item?.isHls && /^https?:\/\//i.test(item.result || '')) ||
                paths.find((item) => /^https?:\/\//i.test(item?.result || ''))

            if (candidate) {
                let playUrl = candidate.result
                if (candidate.isHls) {
                    const separator = playUrl.includes('?') ? '&' : '?'
                    playUrl += `${separator}vv=${getSignature('')}&pub=${publicKey}`
                }
                return jsonify({
                    urls: [playUrl],
                    headers: [{ 'User-Agent': UA, Referer: `${appConfig.site}/` }],
                })
            }
        } catch (error) {
            console.log(`iyf play attempt ${attempt + 1}: ${error.message}`)
        }
    }

    return jsonify({ urls: [] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    const text = encodeURIComponent(ext.text)
    const page = ext.page || 1
    const url = `https://rankv21.iyf.tv/v3/list/briefsearch?tags=${text}&orderby=4&page=${page}&size=10&desc=0&isserial=-1&istitle=true`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const payload = argsify(data) || {}
    const list = payload.data?.info?.[0]?.result || []
    if (Array.isArray(list)) list.forEach((e) => {
        cards.push({
            vod_id: e.contxt,
            vod_name: e.title,
            vod_pic: e.imgPath,
            vod_remarks: e.cid,
            ext: {
                key: e.contxt,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function updateKeys() {
    let baseUrl = 'https://www.iyf.tv'
    let { data } = await $fetch.get(baseUrl, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)
    const script = $('script:contains(injectJson)').text()
    const match = script.match(/var\s+injectJson\s*=\s*(\{[\s\S]*?\})\s*;/)
    if (!match) throw new Error('iyf keys not found')

    const json = JSON.parse(match[1])
    const pConfig = json?.config?.[0]?.pConfig || {}
    const keys = {
        publicKey: pConfig.publicKey,
        privateKey: pConfig.privateKey,
    }
    if (!keys.publicKey || !Array.isArray(keys.privateKey) || keys.privateKey.length === 0) {
        throw new Error('iyf keys invalid')
    }
    $cache.set('iyf-keys', JSON.stringify(keys))
    return keys
}

async function ensureKeys(force = false) {
    if (!force) {
        try {
            const keys = JSON.parse($cache.get('iyf-keys') || '{}')
            if (keys.publicKey && Array.isArray(keys.privateKey) && keys.privateKey.length > 0) {
                return keys
            }
        } catch (error) {
            console.log('iyf cached keys invalid')
        }
    }
    return updateKeys()
}

function getSignature(query) {
    const publicKey = JSON.parse($cache.get('iyf-keys')).publicKey
    const privateKey = getPrivateKey()
    const input = publicKey + '&' + query.toLowerCase() + '&' + privateKey

    return CryptoJS.MD5(CryptoJS.enc.Utf8.parse(input)).toString()
}

function getPrivateKey() {
    const privateKey = JSON.parse($cache.get('iyf-keys')).privateKey
    const timePublicKeyIndex = Date.now()

    return privateKey[timePublicKeyIndex % privateKey.length]
}
