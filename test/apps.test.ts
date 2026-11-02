import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog, podStatus, publicView, render, resolveValues, toMachinePath } from '../src/main/apps'
import type { AppManifest } from '../src/shared/types'

const manifest: AppManifest = {
  id: 'demo',
  name: 'Demo',
  portParam: 'PORT',
  healthPath: '/',
  params: [
    { key: 'PORT', label: 'Port', type: 'port', default: '8080' },
    { key: 'NAME', label: 'Name', type: 'string', default: 'x' },
    { key: 'PASS', label: 'Password', type: 'secret' },
    { key: 'DIR', label: 'Folder', type: 'path', default: '~/media' },
  ],
}

describe('toMachinePath', () => {
  it('maps Windows drive paths into the podman machine', () => {
    expect(toMachinePath('C:\\Users\\me\\Photos', 'win32')).toBe('/mnt/c/Users/me/Photos')
    expect(toMachinePath('~\\Photos', 'win32', 'D:\\home')).toBe('/mnt/d/home/Photos')
  })

  it('expands ~ on Linux and leaves other paths alone', () => {
    expect(toMachinePath('~/media', 'linux', '/home/u')).toBe('/home/u/media')
    expect(toMachinePath('/srv/~x', 'linux', '/home/u')).toBe('/srv/~x')
  })
})

describe('resolveValues', () => {
  it('uses saved values over defaults and generates missing secrets', () => {
    const { values, generated } = resolveValues(manifest, { NAME: 'saved' })
    expect(values.NAME).toBe('saved')
    expect(values.PORT).toBe('8080')
    expect(values.PASS).toHaveLength(24)
    expect(generated).toEqual({ PASS: values.PASS })
    expect(values.TZ).toBeTruthy()
  })

  it('reuses a saved secret', () => {
    expect(resolveValues(manifest, { PASS: 'p' }).generated).toEqual({})
  })
})

describe('render', () => {
  const values = { PORT: '8080', NAME: "it's", PASS: 'p', DIR: 'C:\\x', TZ: 'UTC' }

  it('inserts ports bare and escapes quotes in strings', () => {
    expect(render("port: ${PORT}\nname: '${NAME}'", manifest, values)).toBe("port: 8080\nname: 'it''s'")
  })

  it('rejects a non-numeric port', () => {
    expect(() => render('${PORT}', manifest, { ...values, PORT: '80: x' })).toThrow(/port number/)
  })

  it('rejects unknown placeholders', () => {
    expect(() => render('${NOPE}', manifest, values)).toThrow(/unknown setting NOPE/)
  })
})

describe('podStatus', () => {
  it('maps pod state and health', () => {
    const pod = (status: string) => ({ name: 'p', status, containers: {} })
    expect(podStatus(undefined, false)).toBe('stopped')
    expect(podStatus(pod('Running'), true)).toBe('healthy')
    expect(podStatus(pod('Running'), false)).toBe('running')
    expect(podStatus(pod('Exited'), false)).toBe('stopped')
    expect(podStatus(pod('Dead'), false)).toBe('error')
  })
})

describe('publicView', () => {
  it('never exposes secrets', () => {
    expect(publicView(manifest, { PASS: 'p', NAME: 'n' }, 'stopped').values).toEqual({ NAME: 'n' })
  })
})

describe('catalog', () => {
  it('renders every bundled app with its defaults', () => {
    const catalog = loadCatalog(join(__dirname, '../catalog'))
    expect(catalog.map((a) => a.manifest.id).sort()).toEqual(['audiobookshelf', 'immich', 'pihole'])
    for (const { manifest, template } of catalog) {
      const yaml = render(template, manifest, resolveValues(manifest, {}).values)
      expect(yaml).toContain(`name: homeapp-${manifest.id}`)
      expect(yaml).not.toContain('${')
      expect(manifest.params.some((p) => p.key === manifest.portParam)).toBe(true)
    }
  })

  it('keeps homenet env names for migration', () => {
    const immich = JSON.parse(readFileSync(join(__dirname, '../catalog/immich/homeapp.json'), 'utf8')) as AppManifest
    expect(immich.params.find((p) => p.key === 'IMMICH_UPLOAD_LOCATION')?.homenetEnv).toBe('IMMICH_UPLOAD_LOCATION')
  })
})
