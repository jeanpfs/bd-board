import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const publicDir = path.join(rootDir, '.output/public')
const assetsDir = path.join(publicDir, 'assets')
const desktopDistDir = path.join(rootDir, 'dist')

const entries = await readdir(assetsDir)
const jsEntry = entries.find((file) => /^index-.*\.js$/.test(file))
const cssEntry = entries.find((file) => /^styles-.*\.css$/.test(file))

if (!jsEntry) {
  throw new Error('Unable to find the Tauri JS entry in .output/public/assets')
}

if (!cssEntry) {
  throw new Error('Unable to find the Tauri CSS entry in .output/public/assets')
}

const html = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>bd · board</title>
    <link rel="stylesheet" href="/assets/${cssEntry}" />
  </head>
  <body class="min-h-screen bg-background text-foreground antialiased">
    <script type="module" src="/assets/${jsEntry}"></script>
  </body>
</html>
`

await mkdir(publicDir, { recursive: true })
await rm(desktopDistDir, { recursive: true, force: true })
await cp(publicDir, desktopDistDir, { recursive: true })
await writeFile(path.join(desktopDistDir, 'index.html'), html)
