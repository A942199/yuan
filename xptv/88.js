const cheerio = createCheerio();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const appConfig = {
  ver: 1,
  title: '88看球',
  site: 'https://www.88kanqiu.bar',
  tabs: [
    { name: '全部直播', ext: { url: 'https://www.88kanqiu.bar/' } },

    { name: 'NBA', ext: { url: 'https://www.88kanqiu.bar/match/1/live' } },
    { name: 'CBA', ext: { url: 'https://www.88kanqiu.bar/match/2/live' } },
    { name: 'WNBA', ext: { url: 'https://www.88kanqiu.bar/match/4/live' } },
    { name: '篮球综合', ext: { url: 'https://www.88kanqiu.bar/match/22/live' } },

    { name: '世界杯', ext: { url: 'https://www.88kanqiu.bar/match/8/live' } },
    { name: '英超', ext: { url: 'https://www.88kanqiu.bar/match/9/live' } },
    { name: '西甲', ext: { url: 'https://www.88kanqiu.bar/match/10/live' } },
    { name: '意甲', ext: { url: 'https://www.88kanqiu.bar/match/14/live' } },
    { name: '德甲', ext: { url: 'https://www.88kanqiu.bar/match/15/live' } },
    { name: '法甲', ext: { url: 'https://www.88kanqiu.bar/match/12/live' } },
    { name: '欧冠', ext: { url: 'https://www.88kanqiu.bar/match/13/live' } },
    { name: '欧联', ext: { url: 'https://www.88kanqiu.bar/match/16/live' } },
    { name: '中超', ext: { url: 'https://www.88kanqiu.bar/match/28/live' } },
    { name: '亚冠', ext: { url: 'https://www.88kanqiu.bar/match/7/live' } },
    { name: '足总杯', ext: { url: 'https://www.88kanqiu.bar/match/11/live' } },
    { name: '美职联', ext: { url: 'https://www.88kanqiu.bar/match/33/live' } },
    { name: '中甲', ext: { url: 'https://www.88kanqiu.bar/match/27/live' } },
    { name: '足球综合', ext: { url: 'https://www.88kanqiu.bar/match/23/live' } },

    { name: '体育电视台', ext: { url: 'https://www.88kanqiu.bar/match/26/live' } },
    { name: '网球', ext: { url: 'https://www.88kanqiu.bar/match/3/live' } },
    { name: 'NFL', ext: { url: 'https://www.88kanqiu.bar/match/21/live' } },
    { name: '羽毛球', ext: { url: 'https://www.88kanqiu.bar/match/18/live' } }
  ]
};

const headers = {
  'User-Agent': UA,
  Referer: appConfig.site + '/',
  Origin: appConfig.site
};

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(url) {
  if (!url) return '';

  url = String(url).trim();

  if (url.startsWith('//')) return 'https:' + url;

  if (url.startsWith('http://www.88kanqiu.bar')) {
    return url.replace('http://www.88kanqiu.bar', appConfig.site);
  }

  if (url.startsWith('https://www.88kanqiu.bar')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  if (url.startsWith('/')) return appConfig.site + url;

  return appConfig.site + '/' + url;
}

function safeJsonParse(text) {
  try {
    if (typeof text === 'object') return text;
    return JSON.parse(text);
  } catch (e) {
    try {
      return argsify(text);
    } catch (e2) {
      return {};
    }
  }
}

function decodeBase64(str) {
  str = String(str || '').replace(/\s/g, '');

  try {
    if (typeof base64Decode === 'function') {
      return base64Decode(str);
    }
  } catch (e) {}

  try {
    if (typeof atob === 'function') {
      const bin = atob(str);
      try {
        return decodeURIComponent(
          bin
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
      } catch (e) {
        return bin;
      }
    }
  } catch (e) {}

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf-8');
    }
  } catch (e) {}

  return str;
}

function safeDecodeURIComponent(url) {
  try {
    return decodeURIComponent(url);
  } catch (e) {
    return url;
  }
}

function parseRealPlayUrl(raw) {
  let url = String(raw || '').trim();

  url = safeDecodeURIComponent(url);

  // 处理：播放器?url=真实地址
  if (/[?&]url=/.test(url)) {
    const m = url.match(/[?&]url=([^&#]+)/);
    if (m && m[1]) {
      url = safeDecodeURIComponent(m[1]);
    }
  }

  // 处理：播放器?embed=base64地址
  if (/embed=/.test(url)) {
    const m = url.match(/embed=([^&#]+)/);
    if (m && m[1]) {
      let b64 = safeDecodeURIComponent(m[1]);
      url = decodeBase64(b64);
      url = safeDecodeURIComponent(url);
    }
  }

  // 处理多余锚点
  url = url.split('#')[0];

  return url;
}

function sniffPlayUrlFromText(text) {
  text = String(text || '');

  const patterns = [
    /https?:\/\/[^"'\\\s]+?\.m3u8[^"'\\\s]*/i,
    /https?:\/\/[^"'\\\s]+?\.mp4[^"'\\\s]*/i,
    /https?:\/\/[^"'\\\s]+?\.flv[^"'\\\s]*/i,
    /url\s*[:=]\s*['"]([^'"]+)['"]/i,
    /playurl\s*[:=]\s*['"]([^'"]+)['"]/i,
    /source\s*[:=]\s*['"]([^'"]+)['"]/i,
    /src\s*=\s*['"]([^'"]+?\.m3u8[^'"]*)['"]/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (m && m[1]) return m[1];
    if (m && m[0] && /^https?:\/\//i.test(m[0])) return m[0];
  }

  return '';
}

async function resolvePlayUrl(raw, referer) {
  let url = parseRealPlayUrl(raw);

  if (!url) return '';

  url = absUrl(url);

  // 已经是直链就直接返回
  if (/\.(m3u8|mp4|flv)(\?|$)/i.test(url)) {
    return url;
  }

  // 如果还是播放器页，尝试打开页面嗅探真实 m3u8/mp4/flv
  try {
    const { data } = await $fetch.get(url, {
      headers: {
        ...headers,
        Referer: referer || appConfig.site + '/'
      }
    });

    let found = sniffPlayUrlFromText(data);

    if (found) {
      found = parseRealPlayUrl(found);
      found = absUrl(found);
      return found;
    }
  } catch (e) {
    $print('88看球 resolvePlayUrl error: ' + e.message);
  }

  return url;
}

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);

  const page = Number(ext.page || 1);
  if (page > 1) {
    return jsonify({
      list: []
    });
  }

  const url = absUrl(ext.url || appConfig.site + '/');
  const cards = [];

  try {
    const { data } = await $fetch.get(url, { headers });
    const $ = cheerio.load(data);

    $('.list-group .group-game-item').each((_, item) => {
      const $item = $(item);

      let href =
        $item.find('a[href*="/live/"][href*="/play"]').first().attr('href') ||
        $item.find('a[href*="/play"]').first().attr('href') ||
        $item.find('a').first().attr('href');

      href = absUrl(href);

      if (!href) return;

      const $img = $item.find('img').first();
      const pic = absUrl($img.attr('data-src') || $img.attr('src') || '');

      const status = cleanText($item.find('.btn').first().text()) || '直播';
      const league = cleanText($item.find('.game-info-container').text());
      const time = cleanText($item.find('.game-time').text());

      const teams = [];
      $item.find('.team-name').each((_, team) => {
        const name = cleanText($(team).text());
        if (name) teams.push(name);
      });

      let title = '';

      if (teams.length >= 2) {
        title = `${teams[0]} vs ${teams[1]}`;
      } else {
        title =
          cleanText($item.find('.d-none').first().text()) ||
          cleanText($item.text()).replace(status, '').trim();
      }

      if (league && title && !title.includes(league)) {
        title = `${league} ${title}`;
      }

      cards.push({
        vod_id: href,
        vod_name: title || '比赛直播',
        vod_pic: pic,
        vod_remarks: status,
        vod_pubdate: time,
        ext: {
          url: href
        }
      });
    });

    // 兜底解析
    if (cards.length === 0) {
      $('a[href*="/live/"][href*="/play"], a[href*="/play"]').each((_, a) => {
        let href = absUrl($(a).attr('href'));
        if (!href) return;

        if (cards.some(v => v.ext && v.ext.url === href)) return;

        const $block = $(a).closest('.group-game-item, li, .list-group-item, div');
        const $img = $block.find('img').first();

        const pic = absUrl($img.attr('data-src') || $img.attr('src') || '');

        let text = cleanText($block.text() || $(a).text());

        let status = '直播';
        if (text.includes('直播中')) status = '直播中';
        if (text.includes('未开始')) status = '未开始';
        if (text.includes('已结束')) status = '已结束';

        text = text.replace(status, '').trim();

        cards.push({
          vod_id: href,
          vod_name: text || cleanText($(a).text()) || '比赛直播',
          vod_pic: pic,
          vod_remarks: status,
          ext: {
            url: href
          }
        });
      });
    }
  } catch (e) {
    $print('88看球 getCards error: ' + e.message);
  }

  return jsonify({
    list: cards
  });
}

async function getTracks(ext) {
  ext = argsify(ext);

  const playPage = absUrl(ext.url || ext.vod_id || '');
  const apiUrl = playPage.replace('/play', '/play-url');

  const tracks = [];

  try {
    const { data } = await $fetch.get(apiUrl, {
      headers: {
        ...headers,
        Referer: playPage,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/javascript, */*; q=0.01'
      }
    });

    const json = safeJsonParse(data);
    let pdata = String(json.data || '');

    if (!pdata) {
      $print('88看球 play-url data empty: ' + JSON.stringify(json));
      return jsonify({
        list: [
          {
            title: '实时直播',
            tracks: []
          }
        ]
      });
    }

    // 原 DRPY 规则逻辑：
    // let pdata = JSON.parse(html).data;
    // pdata = pdata.slice(6);
    // pdata = pdata.slice(0, -2);
    // pdata = base64Decode(pdata);
    pdata = pdata.slice(6, -2);
    pdata = decodeBase64(pdata);

    const jo = safeJsonParse(pdata);
    const links = jo.links || [];

    links.forEach((it, idx) => {
      if (!it || !it.url) return;

      tracks.push({
        name: it.name || `线路${idx + 1}`,
        pan: '',
        ext: {
          // 重点：XPTV 播放入口放 ext.url
          url: it.url,
          referer: playPage
        }
      });
    });

    $print('88看球 tracks count: ' + tracks.length);
  } catch (e) {
    $print('88看球 getTracks error: ' + e.message);
  }

  return jsonify({
    list: [
      {
        title: '实时直播',
        tracks: tracks
      }
    ]
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);

  const raw = ext.url || '';
  const referer = ext.referer || appConfig.site + '/';

  let playurl = '';

  try {
    playurl = await resolvePlayUrl(raw, referer);
  } catch (e) {
    $print('88看球 getPlayinfo resolve error: ' + e.message);
    playurl = parseRealPlayUrl(raw);
    playurl = absUrl(playurl);
  }

  $print('88看球 final playurl: ' + playurl);

  if (!playurl) {
    return jsonify({
      urls: [],
      headers: []
    });
  }

  return jsonify({
    urls: [playurl],
    headers: [
      {
        'User-Agent': UA,
        Referer: referer,
        Origin: appConfig.site
      }
    ]
  });
}

async function search(ext) {
  return jsonify({
    list: []
  });
}
