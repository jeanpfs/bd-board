import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const publicDir = path.join(rootDir, '.output/public')
const desktopDistDir = path.join(rootDir, 'dist')
const shellPath = path.join(publicDir, '_shell.html')

await mkdir(publicDir, { recursive: true })
await rm(desktopDistDir, { recursive: true, force: true })
await cp(publicDir, desktopDistDir, { recursive: true })
await copyFile(shellPath, path.join(desktopDistDir, 'index.html'))
