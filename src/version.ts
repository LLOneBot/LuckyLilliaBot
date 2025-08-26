import fs from 'fs'
import packageJson from '../package-dist.json'

export const version = '5.8.1'

export const writeVersion = ()=>{
  const pkgJsonPath = './package-dist.json'
  packageJson.version = version
  fs.writeFileSync(pkgJsonPath, JSON.stringify(packageJson), 'utf8')
}
