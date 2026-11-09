import { describe, expect, it } from 'vitest'
import { imageUrl, isImageSource, isScreenshot, previewImages } from '@/plugin/internal/tool/market/images'

const plugin = { name: '@author/example', version: '1.2.3-rc.1+build.2' }
const base = 'https://cdn.jsdelivr.net/npm/@author/example@1.2.3-rc.1%2Bbuild.2/'

describe('market image URLs', () => {
  it('binds package paths to the catalog version and encodes literal filename characters', () => {
    expect(imageUrl(plugin, './assets/icon.png')).toBe(base + 'assets/icon.png')
    expect(imageUrl(plugin, "assets/设置 100% #?!'().svg")).toBe(base + 'assets/%E8%AE%BE%E7%BD%AE%20100%25%20%23%3F%21%27%28%29.svg')
    expect(imageUrl(plugin, 'assets/%2e%2e/icon.png')).toBe(base + 'assets/%252e%252e/icon.png')
    expect(imageUrl({ name: 'example-plugin', version: '2.0.0' }, 'icon.JPG')).toBe('https://cdn.jsdelivr.net/npm/example-plugin@2.0.0/icon.JPG')
  })

  it('preserves external HTTP(S) addresses without adding a CDN prefix', () => {
    for (const url of ['https://images.example/icon?size=96#image', 'HTTP://images.example/icon.png']) {
      expect(imageUrl(plugin, url)).toBe(url)
    }
  })

  it('preserves screenshot order and captions for string and object declarations', () => {
    expect(previewImages({ ...plugin, screenshots: [
      'assets/preview.png', { src: './assets/设置 界面.webp', caption: '设置界面' },
      { src: 'http://images.example/second.png' },
    ] })).toEqual([
      { url: base + 'assets/preview.png' },
      { url: base + 'assets/%E8%AE%BE%E7%BD%AE%20%E7%95%8C%E9%9D%A2.webp', caption: '设置界面' },
      { url: 'http://images.example/second.png' },
    ])
    expect(previewImages(plugin)).toEqual([])
    expect(previewImages({ ...plugin, screenshots: [] })).toEqual([])
  })

  it.each([undefined, null, '', '../outside.png', './assets/../outside.png', '/image.png', 'C:/image.png',
    'assets\\image.png', 'assets/image\n.png', 'assets/image.txt', ' assets/image.png', 'assets/image.png ',
    '//images.example/image.png', 'https:///images.example/image.png', 'https://user:secret@images.example/image.png',
    'https://@images.example/image.png', 'https://images.example/image with space.png', 'javascript:image.png',
    'data:image/png;base64,AAAA', 'x'.repeat(2045) + '.png',
  ])('never constructs an image request for an unsafe source: %s', source => {
    expect(isImageSource(source)).toBe(false)
    expect(imageUrl(plugin, source)).toBeUndefined()
    expect(isScreenshot({ src: source })).toBe(false)
  })

  it('handles unencodable filenames without breaking the market card', () => {
    expect(imageUrl(plugin, 'assets/\ud800.png')).toBeUndefined()
  })
})
