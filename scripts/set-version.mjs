import { readFile, writeFile } from 'node:fs/promises'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: pnpm version:set <major.minor.patch[-prerelease]>')
  process.exit(1)
}

const pkgPath = 'package.json'
const cargoPath = 'src-tauri/Cargo.toml'
const lockPath = 'src-tauri/Cargo.lock'

const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
pkg.version = version

const cargo = await readFile(cargoPath, 'utf8')
const nextCargo = cargo.replace(
  /^version = "[^"]+"$/m,
  `version = "${version}"`,
)
if (nextCargo === cargo)
  throw new Error(`no [package] version line in ${cargoPath}`)

const lock = await readFile(lockPath, 'utf8')
const lockPattern = /(name = "bd-board-desktop"\nversion = ")[^"]+(")/
if (!lockPattern.test(lock))
  throw new Error(`no bd-board-desktop entry in ${lockPath}`)
const nextLock = lock.replace(lockPattern, `$1${version}$2`)

await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
await writeFile(cargoPath, nextCargo)
await writeFile(lockPath, nextLock)

console.log(
  `version set to ${version}; commit, then: git tag v${version} && git push --follow-tags`,
)
