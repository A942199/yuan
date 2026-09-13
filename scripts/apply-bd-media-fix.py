from pathlib import Path

changed = False

yiys = Path('js/yiys.js')
text = yiys.read_text()
if 'resolved_media_dead' not in text:
    old = """const SITE = 'https://aleig4ah.yiys05.com'\nconst FALLBACK_SITES = [\n    SITE,\n    SITE.replace(/^https:/i, 'http:'),\n]"""
    new = """const SITE = 'https://otkxofv8.yiys08.com'\nconst FALLBACK_SITES = [\n    SITE,\n    'https://api2233.yiys06.com',\n    'https://ws4afrx6.yiys06.com',\n]"""
    if old not in text:
        raise SystemExit('yiys host block not found')
    text = text.replace(old, new, 1)

    marker = 'async function resolvePlayCandidate(candidate) {'
    helper = """async function isPlayableMediaUrl(url) {\n    const value = textOf(url).trim()\n    if (!/^https?:\\/\\//i.test(value)) return false\n    if (!/\\.m3u8(?:$|[?#])/i.test(value)) return true\n    try {\n        const resp = await $fetch.get(value, { headers: { 'User-Agent': UA } })\n        const status = Number(resp && resp.status || 200)\n        const body = textOf(resp && resp.data).replace(/^\\uFEFF/, '').trimStart()\n        return status >= 200 && status < 400 && body.startsWith('#EXTM3U')\n    } catch (_) {\n        return false\n    }\n}\n\n"""
    if marker not in text:
        raise SystemExit('yiys resolve marker missing')
    text = text.replace(marker, helper + marker, 1)

    old = """        if (/^https?:\\/\\//i.test(playUrl)) {\n            return { ok: true, url: playUrl, reason: 'resolved' }\n        }"""
    new = """        if (/^https?:\\/\\//i.test(playUrl)) {\n            if (await isPlayableMediaUrl(playUrl)) return { ok: true, url: playUrl, reason: 'resolved' }\n            return { ok: false, reason: 'resolved_media_dead' }\n        }"""
    if old not in text:
        raise SystemExit('yiys resolved block missing')
    text = text.replace(old, new, 1)

    old = """    if (/^https?:\\/\\//i.test(rawUrl)) {\n        return { ok: true, url: rawUrl, reason: 'raw_direct' }\n    }"""
    new = """    if (/^https?:\\/\\//i.test(rawUrl)) {\n        if (await isPlayableMediaUrl(rawUrl)) return { ok: true, url: rawUrl, reason: 'raw_direct' }\n        return { ok: false, reason: 'raw_media_dead' }\n    }"""
    if old not in text:
        raise SystemExit('yiys raw block missing')
    text = text.replace(old, new, 1)
    yiys.write_text(text)
    changed = True

jp = Path('js/jianpian.js')
text = jp.read_text()
if 'source_media_unavailable' not in text:
    old = """        const priority = (source) => {\n            const label = `${source.source_key || ''} ${source.name || ''}`.toLowerCase()\n            if (label.includes('lz')) return 0\n            if (label.includes('sd')) return 1\n            if (label.includes('高清1') || label.includes('dytt')) return 2\n            if (label.includes('蓝光')) return 3\n            if (label.includes('vip')) return 4\n            return 5\n        }"""
    new = """        const priority = (source) => {\n            const key = String(source.source_key || '').toLowerCase()\n            const label = `${source.source_key || ''} ${source.name || ''}`.toLowerCase()\n            if (key === 'back_source_list_cdn' || label.includes('vip') || label.includes('极速') || label.includes('高速')) return 0\n            if (key === 'back_source_list_dszy' || label.includes('蓝光')) return 1\n            if (key === 'back_source_list_hnzy' || key === 'back_source_list_hhzy' || key === 'back_source_list_mtzy') return 2\n            if (label.includes('高清4') || label.includes('高清3')) return 3\n            if (label.includes('lz')) return 90\n            return 10\n        }"""
    if old not in text:
        raise SystemExit('jianpian priority block missing')
    text = text.replace(old, new, 1)

    old = """            e.source_list.forEach((item) => {"""
    new = """            e.source_list.forEach((item, index) => {"""
    if old not in text:
        raise SystemExit('jianpian item loop missing')
    text = text.replace(old, new, 1)

    old = """                    ext: { url: playUrl },\n                })"""
    new = """                    ext: {\n                        url: playUrl,\n                        fallbacks: sources\n                            .filter((alt) => alt !== e && Array.isArray(alt.source_list))\n                            .map((alt) => alt.source_list[index])\n                            .filter((altItem) => altItem && /^https?:\\/\\//i.test(String(altItem.url || '')))\n                            .map((altItem) => String(altItem.url).trim())\n                            .filter((altUrl) => altUrl && altUrl !== playUrl),\n                    },\n                })"""
    if old not in text:
        raise SystemExit('jianpian track ext block missing')
    text = text.replace(old, new, 1)

    marker = 'async function getPlayinfo(ext) {'
    helper = """async function isPlayableSourceUrl(url, headers) {\n    const value = String(url || '').trim()\n    if (!/^https?:\\/\\//i.test(value)) return false\n    if (!/\\.m3u8(?:$|[?#])/i.test(value)) return true\n    try {\n        const resp = await $fetch.get(value, { headers: headers })\n        const status = Number(resp && resp.status || 200)\n        const body = String(resp && resp.data || '').replace(/^\\uFEFF/, '').trimStart()\n        return status >= 200 && status < 400 && body.startsWith('#EXTM3U')\n    } catch (_) {\n        return false\n    }\n}\n\n"""
    if marker not in text:
        raise SystemExit('jianpian play marker missing')
    text = text.replace(marker, helper + marker, 1)

    old = """    let { url } = ext\n    let playUrl = url\n    let header = getHeader()\n\n    if (!/^https?:\\/\\//i.test(playUrl || '')) return JSON.stringify({ urls: [] })\n    return JSON.stringify({ urls: [playUrl], headers: [header] })"""
    new = """    let { url } = ext\n    let header = getHeader()\n    const candidates = [url].concat(Array.isArray(ext.fallbacks) ? ext.fallbacks : [])\n    const seen = new Set()\n    for (const candidate of candidates) {\n        const playUrl = String(candidate || '').trim()\n        if (!/^https?:\\/\\//i.test(playUrl) || seen.has(playUrl)) continue\n        seen.add(playUrl)\n        if (await isPlayableSourceUrl(playUrl, header)) {\n            return JSON.stringify({ urls: [playUrl], headers: [header] })\n        }\n        $print('source_media_unavailable', playUrl)\n    }\n    return JSON.stringify({ urls: [] })"""
    if old not in text:
        raise SystemExit('jianpian playinfo body missing')
    text = text.replace(old, new, 1)
    jp.write_text(text)
    changed = True

Path('/tmp/patch_changed').write_text('1' if changed else '0')
print('PATCH_CHANGED', changed)
