#!/usr/bin/env node
// Header layout QA: loads a page in headless Chrome at a range of viewport
// widths, measures the header geometry and reports overlaps / overflow.
//
//   node scripts/qa_header.mjs [--page /home.html] [--lib /tmp/gisqa/node_modules]
//                              [--shots /tmp/gisqa/shots] [--widths 1920,1440,...]
//
// Requires puppeteer-core and a local Chrome install. Geometry comes from
// getBoundingClientRect(), so it reflects the real cascade rather than a guess.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}

const PAGE = arg('--page', '/home.html')
const BASE = arg('--base', 'http://127.0.0.1:8947')
const LIB = arg('--lib', '/tmp/gisqa/node_modules')
const SHOTS = arg('--shots', '')
const WIDTHS = arg('--widths', '1920,1600,1512,1440,1366,1280,1152,1024,991,900,768,414,360')
  .split(',')
  .map(Number)

const require = createRequire(path.join(process.cwd(), 'scripts/'))
let puppeteer
try {
  puppeteer = require(path.join(LIB, 'puppeteer-core'))
} catch {
  try {
    puppeteer = require('puppeteer-core')
  } catch {
    console.error('puppeteer-core not found. Install it, then re-run with --lib <path>.')
    process.exit(2)
  }
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const measure = () => {
  const r = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
  }
  const box = (b) => (b ? `${b.l},${b.t} → ${b.r},${b.b}  (${b.w}×${b.h})` : '—')
  const q = (s) => document.querySelector(s)
  const qa = (s) => Array.from(document.querySelectorAll(s))

  const header = q('header.gis-main-header')
  const logoImg = q('header.gis-main-header .logo img')
  const logoBox = logoImg ? logoImg.getBoundingClientRect() : null
  const nav = q('header.gis-main-header nav.menu-wrap')
  const links = qa('header.gis-main-header .main-menu > ul > li > a')
  const btns = qa('header.gis-main-header .gis-nav-cta, header.gis-main-header .gis-student-cta')
  const hamburger = q('#hamburger')
  const navVisible = nav ? getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().width > 0 : false
  const burgerVisible = hamburger ? getComputedStyle(hamburger).display !== 'none' && hamburger.getBoundingClientRect().width > 0 : false

  const overlaps = []
  const items = []
  if (logoBox) items.push(['logo', logoBox])
  links.forEach((a) => items.push([`nav:${a.textContent.trim().split('\n')[0].slice(0, 16)}`, a.getBoundingClientRect()]))
  btns.forEach((a) => items.push([`btn:${a.textContent.trim().slice(0, 16)}`, a.getBoundingClientRect()]))
  const shown = items.filter(([, b]) => b.width > 0)
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i][1]
      const b = shown[j][1]
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 0.5 && oy > 0.5) overlaps.push(`${shown[i][0]} ∩ ${shown[j][0]} = ${ox.toFixed(1)}×${oy.toFixed(1)}px`)
    }
  }

  const vw = window.innerWidth
  const spill = shown.filter(([, b]) => b.right > vw + 0.5 || b.left < -0.5).map(([n, b]) => `${n} [${b.left.toFixed(1)}..${b.right.toFixed(1)}]`)

  return {
    vw,
    docScrollW: document.documentElement.scrollWidth,
    header: r(header),
    container: r(q('header.gis-main-header .container')),
    navCol: r(nav ? nav.parentElement : null),
    nav: r(nav),
    menuUl: r(q('header.gis-main-header .main-menu > ul')),
    logo: r(logoImg),
    links: links.map((a) => [`nav:${a.textContent.trim().split('\n')[0].slice(0, 16)}`, r(a)]),
    btns: btns.map((a) => [`btn:${a.textContent.trim().slice(0, 16)}`, r(a)]),
    navVisible,
    burgerVisible,
    overlaps,
    spill,
  }
}

const clippedText = () =>
  Array.from(document.querySelectorAll('header.gis-main-header .gis-nav-cta, header.gis-main-header .gis-student-cta, header.gis-main-header .main-menu > ul > li > a'))
    .filter((el) => el.getBoundingClientRect().width > 0)
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => `${el.textContent.trim().slice(0, 18)} (${el.scrollWidth}>${el.clientWidth})`)

const box = (b) => (b ? `${b.l},${b.t} → ${b.r},${b.b}  (${b.w}×${b.h})` : '—')

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
})

let failures = 0
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

for (const width of WIDTHS) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.evaluate(() => new Promise((r) => (document.fonts ? document.fonts.ready.then(r) : r())))
  await new Promise((r) => setTimeout(r, 700))

  const m = await page.evaluate(measure)
  const clipped = await page.evaluate(clippedText)

  const bad = m.overlaps.length > 0 || m.spill.length > 0 || clipped.length > 0 || m.docScrollW > m.vw + 1
  if (bad) failures++
  console.log(`${bad ? 'FAIL' : ' ok '}  ${String(width).padStart(5)}px  doc=${m.docScrollW} nav=${m.navVisible ? 'desktop' : 'hidden'} burger=${m.burgerVisible ? 'yes' : 'no'}`)
  console.log(`        header   ${box(m.header)}`)
  console.log(`        logo     ${box(m.logo)}`)
  console.log(`        nav-col  ${box(m.navCol)}   menu-ul ${box(m.menuUl)}`)
  for (const [n, b] of [...m.links, ...m.btns]) console.log(`        ${n.padEnd(22)} ${box(b)}`)
  for (const o of m.overlaps) console.log(`        OVERLAP  ${o}`)
  for (const s of m.spill) console.log(`        SPILL    ${s}  (viewport ${m.vw})`)
  for (const c of clipped) console.log(`        CLIPPED  ${c}`)
  if (bad && SHOTS) {
    const file = path.join(SHOTS, `header-${width}.png`)
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height: 120 } })
    console.log(`        shot     ${file}`)
  }
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} viewport(s) FAILED` : '\nAll viewports clean')
process.exit(failures ? 1 : 0)
