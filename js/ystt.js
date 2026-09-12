const cheerio = createCheerio();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2.1 Mobile/15E148 Safari/604.1';

let appConfig = {
    ver: 20260912,
    title: '影视天堂',
    site: 'https://ysttv.com',
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '电视剧', ext: { id: 2 } },
        { name: '综艺', ext: { id: 3 } },
        { name: '动漫', ext: { id: 4 } }
    ]
};

async function getConfig() {
    return JSON.stringify(appConfig);
}

async function getCards(ext) {
    ext = JSON.parse(ext);
    const page = ext.page || 1;
    const url = `${appConfig.site}/vod/${ext.id}/${page}`;

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    });

    const $ = cheerio.load(data);
    let list = [];

    $('.video-card').each((_, element) => {
        const a = $(element).find('a').first();
        const href = a.attr('href');
        const title = a.attr('title') || $(element).find('h3').text().trim();
        const img = $(element).find('img').attr('data-src') || $(element).find('img').attr('src');
        const remark = $(element).find('.subtitle').text().trim();

        if (!href) return;

        list.push({
            vod_id: new URL(href, appConfig.site).toString(),
            vod_name: title,
            vod_pic: img,
            vod_remarks: remark
        });
    });

    return JSON.stringify({ list });
}

async function getTracks(ext) {
    ext = JSON.parse(ext);
    let list = [];
    const url = ext.url;

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    });

    const $ = cheerio.load(data);
    const tracks = [];
    const seen = new Set();

    // 新版播放页使用 /play/，同时兼容旧版 /player/
    $('a[href^="/play/"], a[href^="/player/"]').each((index, element) => {
        const href = $(element).attr('href');
        if (!href || seen.has(href)) return;
        seen.add(href);

        const name = $(element).text().replace(/\s+/g, ' ').trim() || `播放${index + 1}`;

        tracks.push({
            name,
            pan: '',
            ext: { url: new URL(href, appConfig.site).toString() }
        });
    });

    if (tracks.length > 0) {
        list.push({
            title: '在线播放',
            tracks
        });
    }

    return JSON.stringify({ list });
}

function normalizeMediaUrl(u) {
    if (!u) return '';
    u = String(u)
        .trim()
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');

    if (u.startsWith('//')) u = 'https:' + u;
    return u;
}

function isLikelyAdUrl(u) {
    const low = u.toLowerCase();
    return low.includes('/ad/') ||
        low.includes('/ads/') ||
        low.includes('advert') ||
        low.includes('advertise') ||
        low.includes('preroll') ||
        low.includes('pre-roll');
}

async function getPlayinfo(ext) {
    ext = JSON.parse(ext);
    const pageUrl = ext.url;

    const { data } = await $fetch.get(pageUrl, {
        headers: {
            'User-Agent': UA,
            Referer: `${appConfig.site}/`
        }
    });

    const $ = cheerio.load(data);
    const candidates = [];

    // 不再只读取 #mse，遍历所有 data-url
    $('[data-url]').each((_, el) => {
        const u = normalizeMediaUrl($(el).attr('data-url'));
        if (/^https?:\/\//i.test(u)) candidates.push(u);
    });

    // 某些页面把真实地址写进脚本里
    $('script').each((_, el) => {
        const js = $(el).html() || '';
        const matches = js.match(/https?:\\?\/\\?\/[^"'\\\s]+?(?:\.m3u8|\.mp4)(?:\?[^"'\\\s]*)?/gi);
        if (!matches) return;

        for (const item of matches) {
            const u = normalizeMediaUrl(item);
            if (/^https?:\/\//i.test(u)) candidates.push(u);
        }
    });

    const unique = [...new Set(candidates)];

    // 优先返回看起来像正片的 m3u8 / mp4，并过滤常见广告地址
    const videos = unique.filter(u => {
        const low = u.toLowerCase();
        if (isLikelyAdUrl(u)) return false;
        return low.includes('.m3u8') || low.includes('.mp4');
    });

    if (!videos.length) {
        return JSON.stringify({ urls: [] });
    }

    const playUrl = videos[0];

    return JSON.stringify({
        urls: [playUrl],
        headers: [{
            'User-Agent': UA,
            Referer: pageUrl
        }]
    });
}

async function search(ext) {
    ext = JSON.parse(ext);
    const keyword = ext.text || ext.keyword || '';
    if (!keyword) return JSON.stringify({ list: [] });

    const url = `${appConfig.site}/search/video/${encodeURIComponent(keyword)}/1`;
    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    });

    const $ = cheerio.load(data);
    let list = [];

    $('a.not-link').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const title = $(element).attr('title') || $(element).find('h2').text().trim();
        const img = $(element).find('img').attr('data-src') || $(element).find('img').attr('src');

        list.push({
            vod_id: new URL(href, appConfig.site).toString(),
            vod_name: title,
            vod_pic: img,
            vod_remarks: ''
        });
    });

    return JSON.stringify({ list });
}
