import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IconCache, iconCandidates, manifestIcons, manifestUrl } from '../src/main/icons'

describe('iconCandidates', () => {
  it('ranks large and touch icons first and ends with /favicon.ico', () => {
    const html = `
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel='apple-touch-icon' href='touch.png'>
      <link rel="icon" type="image/png" sizes="192x192" href="https://cdn.example/icon-192.png">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="stylesheet" href="/app.css">`
    expect(iconCandidates(html, 'https://www.example.com/browse')).toEqual([
      'https://cdn.example/icon-192.png',
      'https://www.example.com/touch.png',
      'https://www.example.com/favicon-16.png',
      'https://www.example.com/favicon.ico',
    ])
  })

  it('falls back to /favicon.ico for a page without icon links', () => {
    expect(iconCandidates('<html></html>', 'http://localhost:2283/photos')).toEqual(['http://localhost:2283/favicon.ico'])
  })
})

describe('IconCache', () => {
  it('skips candidates that are not images and caches the first that is', async () => {
    const responses: Record<string, Response> = {
      'https://site.test/': new Response('<link rel="icon" sizes="64x64" href="/a.png">', { headers: { 'content-type': 'text/html' } }),
      'https://site.test/a.png': new Response('<html>not found page</html>', { headers: { 'content-type': 'text/html' } }),
      'https://site.test/favicon.ico': new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/x-icon' } }),
    }
    const cache = new IconCache(mkdtempSync(join(tmpdir(), 'icons-')), async (url) => responses[url] ?? new Response(null, { status: 404 }))
    const found = await cache.fetch('provider-test', 'https://site.test/')
    expect(found?.type).toBe('image/x-icon')
    expect([...cache.cached('provider-test')!.body]).toEqual([1, 2, 3])
  })
})

describe('manifest icons', () => {
  it('finds the manifest and ranks its large icons above the page links', () => {
    const html = '<link rel="manifest" href="/site.webmanifest"><link rel="apple-touch-icon" href="/touch.png">'
    const page = 'https://www.example.com/browse'
    const manifest = 'https://www.example.com/site.webmanifest'
    expect(manifestUrl(html, page)).toBe(manifest)
    const extra = manifestIcons({ icons: [{ src: 'icons/192.png', sizes: '192x192' }, { src: '/512.png', sizes: '512x512' }] }, manifest)
    expect(iconCandidates(html, page, extra)).toEqual([
      'https://www.example.com/512.png',
      'https://www.example.com/icons/192.png',
      'https://www.example.com/touch.png',
      'https://www.example.com/favicon.ico',
    ])
  })

  it('skips monochrome icons and prefers maskable ones at the same size', () => {
    const icons = manifestIcons({
      icons: [
        { src: '/mono.png', sizes: '512x512', purpose: 'monochrome' },
        { src: '/plain.png', sizes: '512x512' },
        { src: '/mask.png', sizes: '512x512', purpose: 'maskable' },
      ],
    }, 'https://a.test/m.json')
    expect(iconCandidates('', 'https://a.test/', icons)).toEqual([
      'https://a.test/mask.png', 'https://a.test/plain.png', 'https://a.test/favicon.ico',
    ])
  })

  it('ignores manifests without icons', () => {
    expect(manifestIcons({ name: 'x' }, 'https://a.test/m.json')).toEqual([])
    expect(manifestIcons(null, 'https://a.test/m.json')).toEqual([])
  })
})

describe('icon fetch bounds', () => {
  it('never follows non-web icon addresses', () => {
    expect(iconCandidates('<link rel="icon" href="file:///etc/passwd">', 'https://a.test/')).toEqual(['https://a.test/favicon.ico'])
  })
})
