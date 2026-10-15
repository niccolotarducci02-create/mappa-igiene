/**
 * Simula localmente la pagina pubblicata (Artifact): avvolge il frammento nello scheletro del contenitore,
 * blocca ogni richiesta verso host non ammessi (come fa la CSP del contenitore) e visita le rotte con Chromium.
 * Uso: node scripts/make-artifact.mjs && node scripts/check-artifact.mjs [cartella-screenshot]
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? '/tmp/claude-0/-home-user/9aeb83c3-813e-5d42-93a5-81c5d4d7ddbe/scratchpad/artifact-sim'
mkdirSync(outDir, { recursive: true })
const fragment = readFileSync('dist-artifact/index.html', 'utf8')
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${fragment}</body></html>`
writeFileSync(join(outDir, 'index.html'), skeleton)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let p = url.pathname === '/' ? '/index.html' : url.pathname
  const file = p === '/index.html' ? join(outDir, 'index.html') : join('dist-artifact', p)
  if (!existsSync(file)) { res.statusCode = 404; return res.end('not found') }
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream')
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(4190, r))

const ALLOWED = ['localhost', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com']
const routes = (process.env.ROUTES ?? '/,/locale/v_giglio,/segnala,/accedi,/ditte,/moderazione,/trasparenza,/nas,/come-funziona,/regole,/termini,/privacy,/dsa').split(',')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) })
const context = await browser.newContext({ viewport: { width: 400, height: 800 }, locale: 'it-IT', colorScheme: process.env.DARK ? 'dark' : 'light' })
await context.route('**/*', (route) => {
  const host = new URL(route.request().url()).hostname
  if (ALLOWED.includes(host)) return route.continue()
  return route.abort('blockedbyclient')
})
const page = await context.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console(${page.url().split('#')[1] ?? '/'}): ${m.text().slice(0, 200)}`) })
let i = 0
for (const r of routes) {
  await page.goto(`http://localhost:4190/#${r}`)
  await page.waitForTimeout(r === '/' ? 6500 : 1200)
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  const text = (await page.locator('body').innerText()).trim().slice(0, 160).replace(/\s+/g, ' ')
  if (sw > cw + 1) problems.push(`overflow on ${r}: ${sw} > ${cw}`)
  const shot = join(outDir, `${String(i++).padStart(2, '0')}-${r.replace(/[^a-z0-9]+/gi, '_') || 'home'}.png`)
  await page.screenshot({ path: shot })
  console.log(`${r.padEnd(18)} overflow=${sw > cw + 1 ? 'YES' : 'no'}  text="${text}"`)
}
await browser.close()
server.close()
console.log(problems.length ? `\nPROBLEMI (${problems.length}):\n- ${[...new Set(problems)].join('\n- ')}` : '\nNessun errore di pagina/console.')
