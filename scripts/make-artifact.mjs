/**
 * Prepara la build per la pubblicazione come pagina "Artifact" (demo cliccabile):
 * - trasforma dist/index.html in un frammento (il contenitore aggiunge da sé doctype/head/body)
 * - incorpora CSS e JS principali inline (nessuna dipendenza da file esterni)
 * - copia comunque dist/assets in dist-artifact/assets per eventuali chunk caricati a richiesta
 * Uso: npm run build:artifact  (= vite build --mode artifact && node scripts/make-artifact.mjs dist-single)
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist-single'
const out = 'dist-artifact'
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`${dist}/index.html non trovato: esegui prima \`npm run build:artifact\``)
  process.exit(1)
}
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'assets'), { recursive: true })
cpSync(join(dist, 'assets'), join(out, 'assets'), { recursive: true })
if (existsSync(join(dist, 'icon.svg'))) cpSync(join(dist, 'icon.svg'), join(out, 'icon.svg'))

let html = readFileSync(join(dist, 'index.html'), 'utf8')
const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? "Nitido"
const fontLinks = [...html.matchAll(/<link[^>]+fonts\.googleapis\.com[^>]*>/g)].map((m) => m[0])
const cssFiles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/[^"]+\.css)"[^>]*>/g)].map((m) => m[1])
const jsFiles = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g)].map((m) => m[1])
const icon = existsSync(join(dist, 'icon.svg')) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(readFileSync(join(dist, 'icon.svg'), 'utf8'))}` : null

const parts = []
parts.push(`<title>${title}</title>`)
parts.push('<meta name="claude:viewport-fit-sides" content="cover">')
if (icon) parts.push(`<link rel="icon" href="${icon}">`)
for (const l of fontLinks) parts.push(l)
for (const f of cssFiles) parts.push(`<style>\n${readFileSync(join(dist, f), 'utf8')}\n</style>`)
parts.push('<div id="root"></div>')
for (const f of jsFiles) {
  const code = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script')
  parts.push(`<script type="module">\n${code}\n</script>`)
}
const fragment = parts.join('\n')
writeFileSync(join(out, 'index.html'), fragment)
const sizeKb = Math.round(Buffer.byteLength(fragment) / 1024)
console.log(`dist-artifact/index.html pronto (${sizeKb} kB, css: ${cssFiles.length}, js: ${jsFiles.length}, font link: ${fontLinks.length})`)
