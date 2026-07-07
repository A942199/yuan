const cheerio = createCheerio();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const headers = {
  'User-Agent': UA,
  'Referer': 'https://www.88kanqiu.bar/',
  'Origin': 'https://www.88kanqiu.bar'
};

const appConfig = {
  ver: 1,
  title: '88看球',
  site: 'https://www.88kanqiu.bar',
  tabs: [
    { name: '全部直播', ui: 1, ext: { url: '/', hasMore: false } },

    { name: 'NBA', ui: 1, ext: { url: '/match/1/live', hasMore: false } },
    { name: 'CBA', ui: 1, ext: { url: '/match/2/live', hasMore: false } },
    { name: 'WNBA', ui: 1, ext: { url: '/match/4/live', hasMore: false } },
    { name: '篮球综合', ui: 1, ext: { url: '/match/22/live', hasMore: false } },

    { name: '世界杯', ui: 1, ext: { url: '/match/8/live', hasMore: false } },
    { name: '英超', ui: 1, ext: { url: '/match/9/live', hasMore: false } },
    { name: '西甲', ui: 1, ext: { url: '/match/10/live', hasMore: false } },
    { name: '意甲', ui: 1, ext: { url: '/match/14/live', hasMore: false } },
    { name: '德甲', ui: 1, ext: { url: '/match/15/live', hasMore: false } },
    { name: '法甲', ui: 1, ext: { url: '/match/12/live', hasMore: false } },
    { name: '欧冠', ui: 1, ext: { url: '/match/13/live', hasMore: false } },
    { name: '欧联', ui: 1, ext: { url: '/match/16/live', hasMore: false } },
    { name: '中超', ui: 1, ext: { url: '/match/28/live', hasMore: false } },
    { name: '亚冠', ui: 1, ext: { url: '/match/7/live', hasMore: false } },
    { name: '足总杯', ui: 1, ext: { url: '/match/11/live', hasMore: false } },
    { name: '美职联', ui: 1, ext: { url: '/match/33/live', hasMore: false } },
    { name: '中甲', ui: 1, ext: { url: '/match/27/live', hasMore: false } },
    { name: '足球综合', ui: 1, ext: { url: '/match/23/live', hasMore: false } },

    { name: '体育电视台', ui: 1, ext: { url: '/match/26/live', hasMore: false } },
    { name: '网球', ui: 1, ext: { url: '/match/3/live', hasMore: false } },
    { name: 'NFL', ui: 1, ext: { url: '/match/21/live', hasMore: false } },
    { name: '羽毛球', ui: 1, ext: { url: '/match/18/live', hasMore: false } }
  ]
};

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absUrl(url) {
  if (!url) return '';
  url = String(url).trim();

  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://www.88kanqiu.bar')) {
    return url.replace('http://www.88kanqiu.bar', appConfig.site);
  }
  if (url.startsWith('https://www.88kanqiu.bar')) return url;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return appConfig.site + url;

  return appConfig.site + '/' + url;
}

function decodeBase64(str) {
  str = String(str || '').replace(/\s/g, '');

  try {
    if (typeof base64Decode === 'function') {
      return base64Decode(str);
    }
  } catch (e) {}

  try {
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
  } catch (e) {}

  return str;
}

function parseRealPlayUrl(raw) {
  let url = String(raw || '').trim();

  try {
    url = decodeURIComponent(url);
  } catch (e) {}

  if (/embed=/.test(url)) {
    const m = url.match(/embed=([^&#]+)/);
    if (m && m[1]) {
      let b64 = m[1];
      try {
        b64 = decodeURIComponent(b64);
      } catch (e) {}
      url = decodeBase64(b64);
    }
  } else if (/[?&]url=/.test(url)) {
    const m = url.match(/[?&]url=([^&#]+)/);
    if (m && m[1]) {
      url = m[1];
      try {
        url = decodeURIComponent(url);
      } catch (e) {}
    }
  }

  return url.split('#')[0];
}

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);

  const page = Number(ext.page || 1);
  if (page > 1) {
    return jsonify({ list: [] });
  }

  const url = absUrl(ext.url || '/');
  const { data } = await $fetch.get(url, { headers });
  const $ = cheerio.load(data);

  const cards = [];

  $('.list-group .group-game-item').each((_, item) => {
    const $item = $(item);
    const $a = $item.find('a[href*="/live/"][href*="/play"]').first();
    const href = absUrl($a.attr('href') || $item.find('a').first().attr('href'));

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
      title = cleanText($item.find('.d-none').text()) || cleanText($item.text()).replace(status, '');
    }

    if (league && !title.includes(league)) {
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

  // 兜底：如果页面结构变化，至少抓取 /live/xxx/play 链接
  if (cards.length === 0) {
    $('a[href*="/live/"][href*="/play"]').each((_, a) => {
      const href = absUrl($(a).attr('href'));
      if (!href) return;
      if (cards.some(v => v.ext && v.ext.url === href)) return;

      const $block = $(a).closest('li, .group-game-item, .list-group-item, div');
      let text = cleanText($block.text() || $(a).text());

      let status = '直播';
      if (text.includes('直播中')) status = '直播中';
      else if (text.includes('未开始')) status = '未开始';
      else if (text.includes('暂无')) status = '暂无';

      text = text.replace(status, '').trim();

      const $img = $block.find('img').first();
      const pic = absUrl($img.attr('data-src') || $img.attr('src') || '');

      cards.push({
        vod_id: href,
        vod_name: text || '比赛直播',
        vod_pic: pic,
        vod_remarks: status,
        ext: {
          url: href
        }
      });
    });
  }

  return jsonify({ list: cards });
}

async function getTracks(ext) {
  ext = argsify(ext);

  const playPage = absUrl(ext.url || ext.vod_id || '');
  const apiUrl = playPage.replace('/play', '/play-url');

  const group = {
    title: '实时直播',
    tracks: []
  };

  try {
    const { data } = await $fetch.get(apiUrl, { headers });
    const json = typeof data === 'string' ? argsify(data) : data;

    let pdata = json.data || '';

    // 原 DRPY 规则里的逻辑：data 去掉前 6 位、后 2 位，再 base64 解码
    if (pdata) {
      pdata = String(pdata).slice(6, -2);
      pdata = decodeBase64(pdata);

      const jo = argsify(pdata);
      const links = jo.links || [];

      links.forEach((it, idx) => {
        if (!it || !it.url) return;

        group.tracks.push({
          name: it.name || `线路${idx + 1}`,
          ext: {
            playurl: it.url
          }
        });
      });
    }
  } catch (e) {
    $print('88看球 getTracks error: ' + e.message);
  }

  return jsonify({
    list: group.tracks.length > 0 ? [group] : []
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);

  const playurl = parseRealPlayUrl(ext.playurl || ext.url || '');

  return jsonify({
    urls: playurl ? [playurl] : [],
    headers: [headers],
    ui: 1
  });
}

async function search(ext) {
  return jsonify({
    list: []
  });
}
