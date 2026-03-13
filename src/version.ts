import fs from 'fs'

export const version = '7.10.1'

export const writeVersion = () => {
  const pkgJsonPath = './package-dist.json'
  const pkgJsonRaw = fs.readFileSync(pkgJsonPath, 'utf8')
  const packageJson = JSON.parse(pkgJsonRaw)
  packageJson.version = version
  fs.writeFileSync(pkgJsonPath, JSON.stringify(packageJson), 'utf8')
}
