# yuan

自托管的 XPTV/CSP 视频源脚本仓库。

## 订阅地址

```text
https://raw.githubusercontent.com/A942199/yuan/refs/heads/main/TV.json
```

## 目录

- `TV.json`：默认启用本仓库 `js/` 目录中经过严格播放验证的 16 个 CSP 源。
- `source-index.json`：记录 27 个源的名称、启停状态、停用原因、CSP API、上游地址和上游 Git blob SHA。
- `js/*.js`：从原订阅引用地址保存的第三方脚本快照，包括因上游 Cloudflare 验证而暂时停用的源。

这些脚本用于审查、修复、版本对比和回滚。运行时仍应放在不带 `allow-same-origin` 的 sandbox iframe 中。

脚本属于第三方内容，版权与许可归其上游作者；重新分发前请核对对应许可。
