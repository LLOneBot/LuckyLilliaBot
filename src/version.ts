import fs from 'fs'

export const version = '5.3.0'

export const writeVersion = ()=>{
  const pkgJsonPath = './package-dist.json'
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  pkgJson.version = version
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson), 'utf8')
}
