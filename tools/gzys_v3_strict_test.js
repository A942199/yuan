const fs = require('fs');
const vm = require('vm');
const axios = require('axios');
const CryptoJSNode = require('crypto-js');
const JSE = require('jsencrypt');
const JSEncryptCtor = JSE.JSEncrypt || JSE.default || JSE;

global.createCryptoJS = () => CryptoJSNode;
global.loadJSEncrypt = () => JSEncryptCtor;
global.argsify = (v) => typeof v === 'string' ? JSON.parse(v) : v;
global.jsonify = (v) => JSON.stringify(v);
global.$print = (...v) => console.log('[SCRIPT]', ...v);
global.$fetch = {
  post: async (url, body, options = {}) => {
    const r = await axios.post(url, body, {
      headers: options.headers || {},
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} ${url}`);
    return {data: r.data};
  }
};

const src = fs.readFileSync('js/gzys.js', 'utf8') + '\n;globalThis.__gz={getCards,getTracks,getPlayinfo};';
vm.runInThisContext(src, {filename: 'gzys.js'});

(async () => {
  const cards = JSON.parse(await __gz.getCards(JSON.stringify({id:'1',page:1,filters:{}})));
  if (!cards.list || !cards.list.length) throw new Error('getCards returned no movies');
  const card = cards.list[0];
  const id = card.ext && card.ext.id ? card.ext.id : card.vod_id;
  console.log('CARD', card.vod_name, id);

  const groups = JSON.parse(await __gz.getTracks(JSON.stringify({id})));
  if (!groups.list || !groups.list.length || !groups.list[0].tracks || !groups.list[0].tracks.length) {
    throw new Error('getTracks returned no playable track');
  }
  const track = groups.list[0].tracks[0];
  console.log('TRACK', track.name);

  const play = JSON.parse(await __gz.getPlayinfo(JSON.stringify(track.ext)));
  const url = play.urls && play.urls[0];
  if (!url) throw new Error('getPlayinfo returned empty URL');
  if (/wanglaoshi|xn--fiqs8s\/hls|\/hls2\/index\.m3u8/i.test(url)) {
    throw new Error(`still returned advertisement URL: ${url}`);
  }
  console.log('PLAY_URL', url);

  const headers = (play.headers && play.headers[0]) || {};
  const manifestResponse = await axios.get(url, {
    headers,
    timeout: 20000,
    maxRedirects: 5,
    responseType: 'text'
  });
  const manifest = String(manifestResponse.data);
  if (!manifest.startsWith('#EXTM3U')) throw new Error('response is not HLS');
  const durations = [...manifest.matchAll(/#EXTINF:([0-9.]+)/g)].map(m => Number(m[1]));
  const duration = durations.reduce((a,b) => a+b, 0);
  const mediaLines = manifest.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  console.log('HLS_SEGMENTS', durations.length, 'DURATION', duration.toFixed(3));
  if (durations.length < 30) throw new Error(`too few HLS segments: ${durations.length}`);
  if (duration < 600) throw new Error(`HLS duration too short: ${duration}`);
  if (!mediaLines.length) throw new Error('manifest has no media segment');

  const firstSegment = new URL(mediaLines[0], url).toString();
  const ts = await axios.get(firstSegment, {
    headers,
    timeout: 20000,
    maxRedirects: 5,
    responseType: 'arraybuffer'
  });
  console.log('FIRST_TS_BYTES', ts.data.byteLength);
  if (ts.data.byteLength < 1000) throw new Error('first TS segment is unexpectedly small');
  console.log('STRICT_GZYS_TEST_PASS');
})().catch(err => {
  console.error('STRICT_GZYS_TEST_FAIL', err && err.stack ? err.stack : err);
  process.exit(1);
});
