
// __gzys_dynamic_auth_v3__
// 2026 protocol: dynamic device registration + token refresh.
const GZ3_HOSTS = [
  'https://apinew.uozvr.com',
  'https://api.w32z7vtd.com',
  'https://api.6a7nnf7.com',
  'https://api.umygrx3.com',
  'https://api.rmedphk.com'
];
const GZ3_AES_KEY = 'OITxa5OqAYjhswxx';
const GZ3_AES_IV = 'rCMNwZASNBKZ8mXV';
const GZ3_DEVICE_OLD_KEY = 'aLFBMWpxBrIDAD1Si/KVvm41';
const GZ3_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUM5+/y8sPsWkd1/RQS64X259E
UwxFXFE5HlA65MqrxnPs0JqoSRojSDy5QhwvROlaD6TwRQHKMY2OAZ6SnQeUJsCh
TEFIR9qUkwrs3/MVUMxjsv6JS6Oe/juclyJGTgVmDhB55EafXsD0SQYVj/QXXsxR
6ewR5E2kL52yAAD4yQIDAQAB
-----END PUBLIC KEY-----`;

const GZ3_STATE = {
  hostIndex: 0,
  token: '',
  tokenId: '',
  registered: false,
  authPromise: null,
  deviceId: String(864150060000000 + Math.floor(Math.random() * 10000)),
  deviceKey: Array.from({length: 40}, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
};

function gz3Log(...v) {
  try { $print(v.join(' ')); } catch (_) {}
}

function gz3Headers(host) {
  return {
    'User-Agent': 'Lavf/57.83.100',
    'code': 'GZ0369',
    'deviceId': GZ3_STATE.deviceId,
    'lang': 'zh_cn',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Version': '2604028',
    'PackageName': 'com.ae06aebdbb.y286327f5a.ofe849883320260517',
    'Ver': '3.0.3.2',
    'api-ver': '3.0.3.2',
    'Referer': host
  };
}

function gz3Parse(v) {
  if (v == null) return v;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (_) {
    try { return argsify(String(v)); } catch (_) { return {}; }
  }
}

function gz3Form(obj) {
  return Object.keys(obj).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k] == null ? '' : String(obj[k]))).join('&');
}

function gz3EncryptRequest(text) {
  const result = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(GZ3_AES_KEY), {
    iv: CryptoJS.enc.Utf8.parse(GZ3_AES_IV),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return result.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
}

function gz3RsaEncrypt(text) {
  const rsa = new JSEncrypt();
  rsa.setPublicKey(GZ3_RSA_PUBLIC_KEY);
  const out = rsa.encrypt(text);
  if (!out) throw new Error('RSA encrypt failed');
  return out;
}

async function gz3SendRaw(host, params, path) {
  const requestKey = gz3EncryptRequest(JSON.stringify(params || {}));
  const keys = gz3RsaEncrypt(JSON.stringify({iv: GZ3_AES_IV, key: GZ3_AES_KEY}));
  const now = String(Math.floor(Date.now() / 1000));
  const signText = `token_id=,token=${GZ3_STATE.token},phone_type=1,request_key=${requestKey},app_id=1,time=${now},keys=${keys}*&zvdvdvddbfikkkumtmdwqppp?|4Y!s!2br`;
  const signature = CryptoJS.MD5(signText).toString().toUpperCase();
  const body = {
    token: GZ3_STATE.token,
    token_id: '',
    phone_type: '1',
    time: now,
    phone_model: 'xiaomi-25031',
    keys,
    request_key: requestKey,
    signature,
    app_id: '1',
    ad_version: '1'
  };
  const res = await $fetch.post(host + path, gz3Form(body), {headers: gz3Headers(host)});
  const raw = res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
  const envelope = gz3Parse(raw);
  if (!envelope || (envelope.code != null && Number(envelope.code) !== 200)) {
    throw new Error(`${path} code=${envelope && envelope.code}`);
  }
  const data = gz3Parse(envelope.data);
  if (!data || !data.keys || !data.response_key) throw new Error(`${path} missing encrypted response`);
  const keyInfo = JSON.parse(rsaDecrypt(data.keys));
  const plain = aesDecrypt(data.response_key, keyInfo.key, keyInfo.iv);
  if (!plain) throw new Error(`${path} decrypt empty`);
  return JSON.parse(plain);
}

function gz3ApplyAuth(result) {
  if (!result || !result.token) throw new Error('auth token missing');
  GZ3_STATE.token = String(result.token);
  if (result.app_user_id != null && result.app_user_id !== '') GZ3_STATE.tokenId = String(result.app_user_id);
}

async function gz3AcrossHosts(path, params) {
  let lastError;
  for (let i = 0; i < GZ3_HOSTS.length; i++) {
    const index = (GZ3_STATE.hostIndex + i) % GZ3_HOSTS.length;
    const host = GZ3_HOSTS[index];
    try {
      const result = await gz3SendRaw(host, params, path);
      GZ3_STATE.hostIndex = index;
      return result;
    } catch (e) {
      lastError = e;
      gz3Log('[GZ3]', host, path, e && e.message ? e.message : e);
    }
  }
  throw lastError || new Error('all Guazi hosts failed');
}

async function gz3EnsureToken() {
  if (GZ3_STATE.token && GZ3_STATE.tokenId) return;
  if (GZ3_STATE.authPromise) return GZ3_STATE.authPromise;
  GZ3_STATE.authPromise = (async () => {
    if (!GZ3_STATE.registered) {
      const signUp = await gz3AcrossHosts('/App/Authentication/Device/signUp', {
        new_key: GZ3_STATE.deviceKey,
        old_key: GZ3_DEVICE_OLD_KEY,
        phone_type: 1,
        code: ''
      });
      gz3ApplyAuth(signUp);
      GZ3_STATE.registered = true;
    }
    const refreshed = await gz3AcrossHosts('/App/Authentication/Authenticator/refresh', {});
    gz3ApplyAuth(refreshed);
  })();
  try { await GZ3_STATE.authPromise; }
  finally { GZ3_STATE.authPromise = null; }
}

async function gz3ApiRequest(params, path) {
  let lastError;
  for (let round = 0; round < 2; round++) {
    await gz3EnsureToken();
    for (let i = 0; i < GZ3_HOSTS.length; i++) {
      const index = (GZ3_STATE.hostIndex + i) % GZ3_HOSTS.length;
      const host = GZ3_HOSTS[index];
      try {
        const result = await gz3SendRaw(host, params, path);
        GZ3_STATE.hostIndex = index;
        return result;
      } catch (e) {
        lastError = e;
        gz3Log('[GZ3]', host, path, e && e.message ? e.message : e);
      }
    }
    GZ3_STATE.token = '';
    GZ3_STATE.tokenId = '';
    GZ3_STATE.registered = false;
  }
  throw lastError || new Error(`Guazi request failed: ${path}`);
}

apiRequest = gz3ApiRequest;
appConfig.site = GZ3_HOSTS[0];
