const cheerio = createCheerio();

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const headers = {
  Referer: 'https://www.88kanqiu.bar/',
  Origin: 'https://www.88kanqiu.bar',
  'User-Agent': UA,
};

let appConfig = {
  ver: 1,
  title: '88看球',
  site: 'https://www.88kanqiu.bar',
  tabs: [
    { name: '全部直播', ui: 1, ext: { url: 'https://www.88kanqiu.bar/' } },

    { name: 'NBA', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/1/live' } },
    { name: 'CBA', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/2/live' } },
    { name: 'WNBA', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/4/live' } },
    { name: '篮球综合', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/22/live' } },

    { name: '世界杯', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/8/live' } },
    { name: '英超', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/9/live' } },
    { name: '西甲', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/10/live' } },
    { name: '意甲', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/14/live' } },
    { name: '德甲', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/15/live' } },
    { name: '法甲', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/12/live' } },
    { name: '欧冠', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/13/live' } },
    { name: '欧联', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/16/live' } },
    { name: '中超', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/28/live' } },
    { name: '亚冠', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/7/live' } },
    { name: '足总杯', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/11/live' } },
    { name: '美职联', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/33/live' } },
    { name: '中甲', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/27/live' } },
    { name: '足球综合', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/23/live' } },

    { name: '体育电视台', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/26/live' } },
    { name: '网球', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/3/live' } },
    { name: 'NFL', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/21/live' } },
    { name: '羽毛球', ui: 1, ext: { url: 'https://www.88kanqiu.bar/match/18/live' } },
  ],
};

function log(msg) {
  try {
    $print('[88看球] ' + msg);
  } catch (e) {}
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlDecode(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\\//g, '/');
}

function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

function absUrl(url) {
  if (!url) return '';

  url = htmlDecode(String(url).trim());

  if (url.startsWith('//')) return 'https:' + url;

  if (url.startsWith('http://www.88kanqiu.bar')) {
    return url.replace('http://www.88kanqiu.bar', appConfig.site);
  }

  if (url.startsWith('https://www.88kanqiu.bar')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  if (url.startsWith('/')) return appConfig.site + url;

  return appConfig.site + '/' + url;
}

function parseJson(data) {
  try {
    if (typeof data === 'object') return data;
  } catch (e) {}

  try {
    return JSON.parse(data);
  } catch (e) {}

  try {
    return argsify(data);
  } catch (e) {}

  return {};
}

function decodeB64(str) {
  str = String(str || '').replace(/\s/g, '');

  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) str += '=';

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
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
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

function isMediaUrl(url) {
  return /\.(m3u8|mp4|flv)(\?|$)/i.test(String(url || ''));
}

function parseRealPlayUrl(input) {
  let playurl = htmlDecode(String(input || '').trim());
  playurl = safeDecodeURIComponent(playurl);

  // 原 lazy 逻辑：embed=base64地址
  if (/embed=/.test(playurl)) {
    let m = playurl.match(/embed=([^&#]+)/);
    if (m && m[1]) {
      let b64 = safeDecodeURIComponent(m[1]);
      playurl = decodeB64(b64);
      playurl = safeDecodeURIComponent(htmlDecode(playurl));
      playurl = playurl.split('#')[0];
    }
  }

  // 原 lazy 逻辑：?url=真实地址
  else if (/\?url=|&url=/.test(playurl)) {
    let m = playurl.match(/[?&]url=([^&#]+)/);
    if (m && m[1]) {
      playurl = safeDecodeURIComponent(htmlDecode(m[1]));
      playurl = playurl.split('#')[0];
    }
  }

  playurl = htmlDecode(playurl).split('#')[0];

  return playurl;
}

function sniffMediaUrl(text) {
  text = htmlDecode(String(text || ''));

  let patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/i,
    /https?:\/\/[^"'\\\s<>]+?\.flv[^"'\\\s<>]*/i,
    /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    let m = text.match(patterns[i]);
    if (m && m[0]) return htmlDecode(m[0]);
  }

  return '';
}

function parsePlayData(pdata) {
  pdata = String(pdata || '');

  let candidates = [];

  // 原始
  candidates.push(pdata);

  // 原 DRPY 规则：
  // pdata = pdata.slice(6);
  // pdata = pdata.slice(0, -2);
  if (pdata.length > 8) {
    candidates.push(pdata.slice(6, -2));
  }

  // 容错
  if (pdata.length > 6) {
    candidates.push(pdata.slice(6));
  }

  if (pdata.length > 2) {
    candidates.push(pdata.slice(0, -2));
  }

  for (let i = 0; i < candidates.length; i++) {
    let item = candidates[i];

    // 1. 直接 JSON
    let direct = parseJson(item);
    if (direct && direct.links && direct.links.length) {
      return direct.links;
    }

    // 2. base64 后 JSON
    let decoded = decodeB64(item);
    let jo = parseJson(decoded);
    if (jo && jo.links && jo.links.length) {
      log('decoded = ' + decoded.substring(0, 300));
      return jo.links;
    }
  }

  return [];
}

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);

  let cards = [];
  let { url, page = 1 } = ext;

  if (page > 1) {
    return jsonify({
      list: [],
    });
  }

  url = absUrl(url || appConfig.site + '/');

  log('getCards url = ' + url);

  const { data } = await $fetch.get(url, {
    headers: headers,
  });

  const $ = cheerio.load(data);

  $('.list-group .group-game-item').each((_, e) => {
    const item = $(e);

    let href =
      item.find('a[href*="/live/"][href*="/play"]').first().attr('href') ||
      item.find('a[href*="/play"]').first().attr('href') ||
      item.find('a').first().attr('href');

    href = absUrl(href);

    if (!href) return;

    let img =
      item.find('img').first().attr('data-src') ||
      item.find('img').first().attr('src') ||
      '';

    img = absUrl(img);

    let status = cleanText(item.find('.btn').first().text()) || '直播';

    let league = cleanText(item.find('.game-info-container').text());

    let time = cleanText(item.find('.game-time').text());

    let teams = [];
    item.find('.team-name').each((_, t) => {
      let name = cleanText($(t).text());
      if (name) teams.push(name);
    });

    let title = '';

    if (teams.length >= 2) {
      title = teams[0] + ' vs ' + teams[1];
    } else {
      title =
        cleanText(item.find('.d-none').first().text()) ||
        cleanText(item.text()).replace(status, '').trim();
    }

    if (league && title && title.indexOf(league) < 0) {
      title = league + ' ' + title;
    }

    cards.push({
      vod_id: href,
      vod_name: title || '比赛直播',
      vod_pic: img,
      vod_remarks: status,
      vod_pubdate: time,
      ext: {
        playPage: href,
      },
    });
  });

  // 兜底：页面结构变化时直接抓 /play 链接
  if (cards.length === 0) {
    $('a[href*="/live/"][href*="/play"], a[href*="/play"]').each((_, a) => {
      let href = absUrl($(a).attr('href'));
      if (!href) return;

      let exists = cards.some((v) => v.ext && v.ext.playPage === href);
      if (exists) return;

      let block = $(a).closest('.group-game-item, li, .list-group-item, div');

      let img =
        block.find('img').first().attr('data-src') ||
        block.find('img').first().attr('src') ||
        '';

      img = absUrl(img);

      let text = cleanText(block.text() || $(a).text());

      let status = '直播';
      if (text.indexOf('直播中') >= 0) status = '直播中';
      if (text.indexOf('未开始') >= 0) status = '未开始';
      if (text.indexOf('已结束') >= 0) status = '已结束';

      text = text.replace(status, '').trim();

      cards.push({
        vod_id: href,
        vod_name: text || cleanText($(a).text()) || '比赛直播',
        vod_pic: img,
        vod_remarks: status,
        ext: {
          playPage: href,
        },
      });
    });
  }

  log('cards count = ' + cards.length);

  return jsonify({
    list: cards,
  });
}

async function getTracks(ext) {
  ext = argsify(ext);

  let tracks = [];

  let playPage = ext.playPage || ext.url || ext.vod_id || '';
  playPage = absUrl(playPage);

  let apiUrl = playPage.replace(/\/play(\?.*)?$/, '/play-url$1');

  log('playPage = ' + playPage);
  log('apiUrl = ' + apiUrl);

  try {
    const apiHeaders = {
      ...headers,
      Referer: playPage,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    };

    const { data } = await $fetch.get(apiUrl, {
      headers: apiHeaders,
    });

    let raw = typeof data === 'string' ? data : JSON.stringify(data);
    log('api raw = ' + raw.substring(0, 300));

    let json = parseJson(data);

    let links = [];

    if (json && json.data) {
      links = parsePlayData(json.data);
    }

    if (json && json.links && json.links.length) {
      links = json.links;
    }

    links.forEach((it, index) => {
      if (!it) return;

      let lineName = it.name || it.title || '线路' + (index + 1);
      let lineUrl = it.url || it.href || it.src || '';

      if (!lineUrl) return;

      tracks.push({
        name: lineName,
        ext: {
          // 按你给的 PandaTV 教程写法：这里必须传 playurl
          playurl: lineUrl,
          referer: playPage,
        },
      });
    });

    log('tracks count = ' + tracks.length);
  } catch (e) {
    log('getTracks error = ' + e.message);
  }

  return jsonify({
    list: [
      {
        title: '实时直播',
        tracks,
      },
    ],
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);

  let playurl = ext.playurl || '';
  let referer = ext.referer || appConfig.site + '/';

  log('getPlayinfo playurl raw = ' + playurl);

  playurl = parseRealPlayUrl(playurl);
  playurl = absUrl(playurl);

  // 如果已经是 m3u8/flv/mp4，直接播放
  if (isMediaUrl(playurl)) {
    log('final playurl = ' + playurl);

    return jsonify({
      urls: [playurl],
      headers: [
        {
          ...headers,
          Referer: referer,
        },
      ],
    });
  }

  // 如果拿到的是播放器页，再尝试打开嗅探一次
  try {
    const { data } = await $fetch.get(playurl, {
      headers: {
        ...headers,
        Referer: referer,
      },
    });

    let realUrl = sniffMediaUrl(data);

    if (realUrl) {
      playurl = absUrl(parseRealPlayUrl(realUrl));
    }
  } catch (e) {
    log('sniff player error = ' + e.message);
  }

  log('final playurl = ' + playurl);

  return jsonify({
    urls: [playurl],
    headers: [
      {
        ...headers,
        Referer: referer,
      },
    ],
  });
}

async function search(ext) {
  return jsonify({
    list: [],
  });
}
