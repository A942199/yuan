# PPnix Relay

给 `js/ppnix.js` 使用的专用中转。用途是让 PPnix 的页面、m3u8、key 等请求从普通 VPS/容器出口发出，避开 Cloudflare Worker / GitHub 云出口访问 `ppnix.com` 时的 522。

## 运行

```bash
docker build -t ppnix-relay .
docker run -d --restart unless-stopped \
  -p 8787:8787 \
  -e RELAY_TOKEN='change-me' \
  --name ppnix-relay ppnix-relay
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## 环境变量

- `PORT`：监听端口，默认 `8787`
- `RELAY_TOKEN`：可选；设置后请求必须带 `X-PPNIX-Relay-Token`
- `PPNIX_COOKIE`：可选；如果该出口访问 PPnix 需要 `cf_clearance`，可填完整 Cookie 字符串
- `PPNIX_UA`：可选；覆盖默认浏览器 UA
- `UPSTREAM_TIMEOUT_MS`：上游超时，默认 `30000`
- `MAX_BODY_BYTES`：单次最大响应，默认 8 MiB

Relay 只允许访问 `ppnix.com` 及其子域名，不是通用开放代理。

## 调用格式

```text
GET /relay?url=https%3A%2F%2Fwww.ppnix.com%2Fcn%2Fmovie%2F347.html
X-PPNIX-Relay-Token: change-me
```

如果返回的是 HLS，Relay 会自动把清单里仍指向 `ppnix.com` 的 URI 改写回 Relay；外部 CDN 地址保持原样。

## 与 js/ppnix.js 配合

`ppnix.js` 支持运行时配置：

```json
{
  "relay": "https://你的-relay-域名",
  "relayToken": "change-me"
}
```

`myvideo` 可把这段 JSON 放进 CSP 源的 `api` 字段并传给脚本运行时。未配置 `relay` 时会继续直连 PPnix，因此不会影响已有用法。
