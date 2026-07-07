const headers = {
  'Referer': 'https://www.88kanqiu.bar/',
  'Origin': 'https://www.88kanqiu.bar',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
};

let appConfig = {
  ver: 1,
  title: '88看球',
  site: 'https://www.88kanqiu.bar',
  tabs: [
    { name: '全部直播', ui: 1, ext: { classId: '' } },

    { name: 'NBA', ui: 1, ext: { classId: '1' } },
    { name: 'CBA', ui: 1, ext: { classId: '2' } },
    { name: 'WNBA', ui: 1, ext: { classId: '20' } },
    { name: '篮球综合', ui: 1, ext: { classId: '4' } },

    { name: '世界杯', ui: 1, ext: { classId: '3' } },
    { name: '英超', ui: 1, ext: { classId: '8' } },
    { name: '西甲', ui: 1, ext: { classId: '9' } },
    { name: '意甲', ui: 1, ext: { classId: '10' } },
    { name: '德甲', ui: 1, ext: { classId: '14' } },
    { name: '法甲', ui: 1, ext: { classId: '15' } },
    { name: '欧冠', ui: 1, ext: { classId: '12' } },
    { name: '欧联', ui: 1, ext: { classId: '13' } },
    { name: '中超', ui: 1, ext: { classId: '7' } },
    { name: '亚冠', ui: 1, ext: { classId: '11' } },
    { name: '足总杯', ui: 1, ext: { classId: '27' } },
    { name: '美职联', ui: 1, ext: { classId: '26' } },
    { name: '中甲', ui: 1, ext: { classId: '31' } },
    { name: '足球综合', ui: 1, ext: { classId: '23' } },

    { name: '体育电视台', ui: 1, ext: { classId: '21' } },
    { name: '网球', ui: 1, ext: { classId: '29' } },
    { name: 'NFL', ui: 1, ext: { classId: '25' } },
    { name: '羽毛球', ui: 1, ext: { classId: '19' } },
    { name: '棒球', ui: 1, ext: { classId: '38' } },
  ],
};

function absUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return appConfig.site + url;
  return appConfig.site + '/' + url;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getImg(block) {
  let m = String(block || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? absUrl(m[1].trim()) : '';
}

function getTitleAttr(block) {
  let m = String(block || '').match(/title=["']([^"']+)["']/i);
  return m ? stripHtml(m[1]) : '';
}

function getBlockByHref(html, href) {
  let idx = html.indexOf(href);
  if (idx < 0) return '';

  let start = html.lastIndexOf('<li', idx);
  let end = html.indexOf('</li>', idx);
  if (start >= 0 && end > idx) return html.slice(start, end + 5);

  start = html.lastIndexOf('<div', idx);
  end = html.indexOf('</div>', idx);
  if (start >= 0 && end > idx) return html.slice(start, end + 6);

  return html.slice(Math.max(0, idx - 1200), Math.min(html.length, idx + 1200));
}

function parseCardText(block, id) {
  let text = stripHtml(block);

  let status = '';
  let sm = text.match(/(直播中|未开始|已结束|暂无)/);
  if (sm) status = sm[1];

  let time = '';
  let tm = text.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}|\d{2}:\d{2})/);
  if (tm) time = tm[1];

  let clean = text
    .replace(/直播中|未开始|已结束|暂无|观看直播|视频直播/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let vodName = getTitleAttr(block);
  let league = '';

  if (!vodName) {
    let parts = clean.split(/\s+VS\s+|\s+vs\s+/i);
    if (parts.length >= 2) {
      let left = parts[0].trim().split(/\s+/);
      let right = parts[1].trim().split(/\s+/);

      let teamA = left[left.length - 1] || '';
      let teamB = right[0] || '';
      league = left.length >= 2 ? left[left.length - 2] : '';

      if (teamA && teamB) vodName = `${teamA} vs ${teamB}`;
    }
  }

  if (!vodName) {
    vodName = clean
      .replace(time, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || `比赛 ${id}`;
  }

  return {
    name: vodName,
    status: status || '直播',
    time,
    league,
  };
}

function parseCards(html) {
  let cards = [];
  let used = {};

  let re = /href=["']([^"']*\/live\/(\d+)\/play[^"']*)["']/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    let id = m[2];

    if (!id || used[id]) continue;
    used[id] = true;

    let block = getBlockByHref(html, href);
    let info = parseCardText(block, id);
    let pic = getImg(block);

    cards.push({
      vod_id: id,
      vod_name: info.name,
      vod_pic: pic,
      vod_remarks: info.status,
      vod_pubdate: info.time,
      vod_duration: info.league,
      ext: {
        gameId: id,
        playPage: absUrl(`/live/${id}/play`),
      },
    });
  }

  return cards;
}

function base64Utf8Decode(str) {
  str = String(str || '').replace(/\s+/g, '');

  try {
    if (typeof atob === 'function') {
      return decodeURIComponent(escape(atob(str)));
    }
  } catch (e) {}

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf8');
    }
  } catch (e) {}

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < str.length; i++) {
    let c = chars.indexOf(str.charAt(i));
    if (c < 0 || c === 64) continue;

    buffer = (buffer << 6) | c;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  try {
    return decodeURIComponent(escape(output));
  } catch (e) {
    return output;
  }
}

function decodeSourceData(raw) {
  if (!raw) return {};

  if (typeof raw === 'object') {
    if (raw.links) return raw;
    if (raw.data) return decodeSourceData(raw.data);
    if (raw.result) return decodeSourceData(raw.result);
    return raw;
  }

  let txt = String(raw).trim();

  try {
    let obj = JSON.parse(txt);
    if (obj && typeof obj === 'object') return obj;
  } catch (e) {}

  // 网站源码里的逻辑：
  // data.substring(6).slice(0, -2) -> atob -> JSON.parse
  try {
    let b64 = txt.substring(6);
    b64 = b64.slice(0, -2);
    let json = base64Utf8Decode(b64);
    return JSON.parse(json);
  } catch (e) {}

  // 兜底：从字符串中找一段比较像 base64 的内容
  try {
    let bm = txt.match(/[A-Za-z0-9+/=]{40,}/);
    if (bm) {
      let json = base64Utf8Decode(bm[0]);
      return JSON.parse(json);
    }
  } catch (e) {}

  return {};
}

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);

  let classId = ext.classId || '';
  let page = Number(ext.page || 1);

  // 这个站直播页基本不是标准翻页结构，page > 1 直接返回空，避免重复。
  if (page > 1) {
    return jsonify({ list: [] });
  }

  let url = classId
    ? `${appConfig.site}/match/${classId}/live`
    : `${appConfig.site}/`;

  const { data } = await $fetch.get(url, { headers });
  let html = String(data || '');

  let cards = parseCards(html);

  return jsonify({
    list: cards,
  });
}

async function getTracks(ext) {
  ext = argsify(ext);

  let gameId = ext.gameId || ext.vod_id || ext.id;
  let playPage = ext.playPage || `${appConfig.site}/live/${gameId}/play`;

  let tracks = [];

  if (!gameId) {
    return jsonify({
      list: [
        {
          title: '播放线路',
          tracks,
        },
      ],
    });
  }

  let sourceUrl = `${appConfig.site}/live/${gameId}/source`;

  const { data } = await $fetch.get(sourceUrl, {
    headers: {
      ...headers,
      Referer: playPage,
    },
  });

  let obj = decodeSourceData(data);
  let links = obj.links || [];

  links.forEach((item, index) => {
    let url = item.url || item.href || item.playurl || item.playUrl;
    if (!url) return;

    tracks.push({
      name: item.name || item.title || `线路${index + 1}`,
      ext: {
        playurl: absUrl(url),
        referer: playPage,
      },
    });
  });

  return jsonify({
    list: [
      {
        title: '播放线路',
        tracks,
      },
    ],
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);

  let playurl = ext.playurl || '';
  let referer = ext.referer || appConfig.site + '/';

  if (!playurl) {
    return jsonify({
      urls: [],
      headers: [],
    });
  }

  // 直接播放地址直接返回
  if (/\.(m3u8|flv|mp4)(\?|$)/i.test(playurl) || /^rtmp/i.test(playurl)) {
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

  // 有些线路是二级播放页，尝试进去提取真实 m3u8/flv/mp4
  try {
    const { data } = await $fetch.get(playurl, {
      headers: {
        ...headers,
        Referer: referer,
      },
    });

    let html = String(data || '');

    let m3u8 = html.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/i);
    if (m3u8) {
      return jsonify({
        urls: [m3u8[0]],
        headers: [
          {
            ...headers,
            Referer: playurl,
          },
        ],
      });
    }

    let flv = html.match(/https?:\/\/[^"'\\\s]+\.flv[^"'\\\s]*/i);
    if (flv) {
      return jsonify({
        urls: [flv[0]],
        headers: [
          {
            ...headers,
            Referer: playurl,
          },
        ],
      });
    }

    let mp4 = html.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/i);
    if (mp4) {
      return jsonify({
        urls: [mp4[0]],
        headers: [
          {
            ...headers,
            Referer: playurl,
          },
        ],
      });
    }
  } catch (e) {}

  // 提取不到就把原始线路交给播放器
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
  ext = argsify(ext);

  let text = String(ext.text || '').trim();
  let page = Number(ext.page || 1);

  if (!text || page > 1) {
    return jsonify({ list: [] });
  }

  // 站内没看到稳定搜索接口，先抓首页并本地过滤。
  const { data } = await $fetch.get(`${appConfig.site}/`, { headers });
  let cards = parseCards(String(data || ''));

  cards = cards.filter((item) => {
    let s = [
      item.vod_name,
      item.vod_remarks,
      item.vod_pubdate,
      item.vod_duration,
    ].join(' ');
    return s.indexOf(text) >= 0;
  });

  return jsonify({
    list: cards,
  });
}
