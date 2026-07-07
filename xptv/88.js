const cheerio = createCheerio();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

  while (str.length % 4 !== 0) {
    str += '=';
  }

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

  // 处理 embed=base64真实地址
  if (/embed=/.test(playurl)) {
    const m = playurl.match(/embed=([^&#]+)/);
    if (m && m[1]) {
      const b64 = safeDecodeURIComponent(m[1]);
      playurl = decodeB64(b64);
      playurl = safeDecodeURIComponent(htmlDecode(playurl));
      playurl = playurl.split('#')[0];
    }
  }

  // 处理 ?url=真实地址
  else if (/\?url=|&url=/.test(playurl)) {
    const m = playurl.match(/[?&]url=([^&#]+)/);
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

  const patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/i,
    /https?:\/\/[^"'\\\s<>]+?\.flv[^"'\\\s<>]*/i,
    /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (m && m[0]) {
      return htmlDecode(m[0]);
    }
  }

  return '';
}

function decodeSourceData(sourceData) {
  sourceData = String(sourceData || '');

  // 页面源码里的真实逻辑：
  // let x = data.slice(6);
  // x = x.slice(0, -2);
  // JSON.parse(decodeURIComponent(escape(window.atob(x))))
  let raw = sourceData.slice(6);
  raw = raw.slice(0, -2);

  let decoded = decodeB64(raw);
  decoded = htmlDecode(decoded);

  log('decoded source = ' + decoded.substring(0, 300));

  const json = parseJson(decoded);
  return json && json.links ? json.links : [];
}

function getGameIdFromUrl(playPage) {
  const m = String(playPage || '').match(/\/live\/(\d+)\/play/);
  return m && m[1] ? m[1] : '';
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

    const status = cleanText(item.find('.btn').first().text()) || '直播';
    const league = cleanText(item.find('.game-info-container').text());
    const time = cleanText(item.find('.game-time').text());

    let teams = [];
    item.find('.team-name').each((_, t) => {
      const name = cleanText($(t).text());
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
      const href = absUrl($(a).attr('href'));
      if (!href) return;

      const exists = cards.some((v) => v.ext && v.ext.playPage === href);
      if (exists) return;

      const block = $(a).closest('.group-game-item, li, .list-group-item, div');

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

  log('playPage = ' + playPage);

  try {
    // 先请求播放页，从源码里取 gameId/shareId
    const { data: playHtml } = await $fetch.get(playPage, {
      headers: {
        ...headers,
        Referer: appConfig.site + '/',
      },
    });

    const $ = cheerio.load(playHtml);

    let gameId = $('#gameId').attr('value') || $('#gameId').val() || '';
    let shareId = $('#shareId').attr('value') || $('#shareId').val() || '';

    // 兜底：从 URL 中取 gameId
    if (!gameId) {
      gameId = getGameIdFromUrl(playPage);
    }

    if (!gameId) {
      log('gameId empty');
      return jsonify({
        list: [{ title: '实时直播', tracks }],
      });
    }

    let sourceUrl = appConfig.site + '/live/' + gameId + '/source';

    if (shareId) {
      sourceUrl += '?share_id=' + encodeURIComponent(shareId);
    }

    log('sourceUrl = ' + sourceUrl);

    const { data } = await $fetch.get(sourceUrl, {
      headers: {
        ...headers,
        Referer: playPage,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    log('source raw = ' + raw.substring(0, 300));

    const json = parseJson(data);

    let links = [];

    if (json && json.data) {
      links = decodeSourceData(json.data);
    }

    if (json && json.links && json.links.length) {
      links = json.links;
    }

    links.forEach((it, index) => {
      if (!it) return;

      const lineName = it.name || it.title || '线路' + (index + 1);
      const lineUrl = it.url || it.href || it.src || '';

      if (!lineUrl) return;

      tracks.push({
        name: lineName,
        ext: {
          // 按你 PandaTV 示例：getPlayinfo 读取 ext.playurl
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
  const referer = ext.referer || appConfig.site + '/';

  log('getPlayinfo playurl raw = ' + playurl);

  playurl = parseRealPlayUrl(playurl);
  playurl = absUrl(playurl);

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

  // 如果线路给的是播放器页，再尝试打开嗅探 m3u8/flv/mp4
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
