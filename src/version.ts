import fs from 'fs'
import packageJson from '../package-dist.json'

export const version = '7.8.5'

export const writeVersion = ()=>{
  const pkgJsonPath = './package-dist.json'
  packageJson.version = version
  fs.writeFileSync(pkgJsonPath, JSON.stringify(packageJson), 'utf8')
}
