import fs from 'fs'
import packageJson from '../package-dist.json'

export const version = '6.3.0'

export const writeVersion = ()=>{
  const pkgJsonPath = './package-dist.json'
  packageJson.version = version
  fs.writeFileSync(pkgJsonPath, JSON.stringify(packageJson), 'utf8')
}
