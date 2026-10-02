#!/usr/bin/env node
// Usage: node ~/.claude/scripts/ui-shot.mjs --url <url> --out <png> --mark 'text:<regex>::<note>' --mark 'css:<selector>::<note>' [--click <css>]... [--auth user:pass] [--wait <regex>] [--width 1400 --height 900]
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const loadPlaywright = async () => {
  if (process.env.PLAYWRIGHT_PATH) return import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href)
  try {
    return createRequire(join(process.cwd(), 'package.json'))('playwright')
  } catch {
    throw new Error('playwright not found: run inside a project that has it installed, or set PLAYWRIGHT_PATH to its index.mjs')
  }
}
const { chromium } = await loadPlaywright()

const args = { mark: [], click: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i].replace(/^--/, '')
  const v = argv[i + 1]
  if (Array.isArray(args[k])) args[k].push(v)
  else args[k] = v
}
if (!args.url || !args.out || args.mark.length === 0) throw new Error('--url, --out and at least one --mark are required')

const marks = args.mark.map((m) => {
  const sep = m.lastIndexOf('::')
  const target = sep < 0 ? m : m.slice(0, sep)
  const note = sep < 0 ? '' : m.slice(sep + 2).trim()
  const [kind, ...rest] = target.split(':')
  if (kind !== 'text' && kind !== 'css') throw new Error(`--mark must start with text: or css: (${m})`)
  return { kind, query: rest.join(':'), note }
})

const W = Number(args.width ?? 1400)
const H = Number(args.height ?? 900)
const [user, pass] = (args.auth ?? '').split(':')
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  ...(user ? { httpCredentials: { username: user, password: pass ?? '' } } : {}),
})
await page.goto(args.url, { waitUntil: 'networkidle' })
if (args.wait) await page.waitForFunction((re) => new RegExp(re).test(document.body.innerText), args.wait, { timeout: 60000 })
for (const sel of args.click) {
  await page.locator(sel).first().click()
  await page.waitForTimeout(1200)
}

const found = await page.evaluate(({ marks, W, H }) => {
  const visible = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < H && r.left < W
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return visible(r) ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  }
  return marks.map(({ kind, query }) => {
    let els = []
    if (kind === 'css') els = [...document.querySelectorAll(query)]
    else {
      const re = new RegExp(query)
      els = [...document.querySelectorAll('body *')].filter((el) => {
        const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim()
        return own && re.test(own)
      })
    }
    return els.map(box).filter(Boolean)
  })
}, { marks, W, H })

const shot = (await page.screenshot()).toString('base64')
const missing = marks.filter((_, i) => found[i].length === 0).map((m) => `${m.kind}:${m.query}`)

const M = 380
const compose = await browser.newPage({ viewport: { width: W + M * 2, height: H }, deviceScaleFactor: 2 })
await compose.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0"></body>`)
const height = await compose.evaluate(({ shot, marks, found, W, H, M }) => {
  const PAD = 5
  const Y = '#f5c400'
  document.body.style.cssText = `margin:0;width:${W + M * 2}px;background:#8c8c8c;position:relative;font-family:"Hiragino Sans","Noto Sans JP",sans-serif`
  const img = document.createElement('img')
  img.src = `data:image/png;base64,${shot}`
  img.style.cssText = `position:absolute;left:${M}px;top:0;width:${W}px;height:${H}px;box-shadow:0 8px 30px rgba(0,0,0,.35)`
  document.body.appendChild(img)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none'
  svg.setAttribute('width', W + M * 2)
  document.body.appendChild(svg)

  for (const rects of found) for (const r of rects) {
    const d = document.createElement('div')
    d.style.cssText = `position:absolute;left:${M + r.x - PAD}px;top:${r.y - PAD}px;width:${r.w + PAD * 2}px;height:${r.h + PAD * 2}px;border:3px solid ${Y};border-radius:8px;box-sizing:border-box`
    document.body.appendChild(d)
  }

  const items = marks
    .map((m, i) => ({ i, note: m.note, r: found[i][0] }))
    .filter((it) => it.r && it.note)
    .map((it) => ({ ...it, side: it.r.x + it.r.w / 2 < W / 2 ? 'left' : 'right', cy: it.r.y + it.r.h / 2 }))
  let maxBottom = H
  for (const side of ['left', 'right']) {
    let floor = 16
    for (const it of items.filter((x) => x.side === side).sort((a, b) => a.cy - b.cy)) {
      const c = document.createElement('div')
      c.textContent = `${it.i + 1}. ${it.note}`
      c.style.cssText = `position:absolute;width:${M - 56}px;${side === 'left' ? 'left:24px' : `left:${M + W + 32}px`};background:#ffd400;color:#1a1a1a;font-weight:700;font-size:17px;line-height:1.55;padding:10px 14px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.25);box-sizing:border-box`
      document.body.appendChild(c)
      const h = c.offsetHeight
      const top = Math.max(floor, it.cy - h / 2)
      c.style.top = `${top}px`
      floor = top + h + 14
      maxBottom = Math.max(maxBottom, floor)
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      const x1 = side === 'left' ? 24 + (M - 56) : M + W + 32
      const x2 = side === 'left' ? M + it.r.x - PAD : M + it.r.x + it.r.w + PAD
      line.setAttribute('x1', x1); line.setAttribute('y1', top + h / 2)
      line.setAttribute('x2', x2); line.setAttribute('y2', it.cy)
      line.setAttribute('stroke', Y); line.setAttribute('stroke-width', 3)
      svg.appendChild(line)
    }
  }
  svg.setAttribute('height', maxBottom)
  document.body.style.height = `${maxBottom}px`
  return maxBottom
}, { shot, marks, found, W, H, M })
await compose.setViewportSize({ width: W + M * 2, height: Math.ceil(height) })
await compose.waitForTimeout(200)
await compose.screenshot({ path: args.out, fullPage: true })
await browser.close()
console.log(`marks=${marks.length} boxes=${found.flat().length} out=${args.out}`)
if (missing.length) {
  console.error(`not found: ${missing.join(', ')}`)
  process.exitCode = 2
}
