import React from 'react'
import { SchemaSettings, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:satori'

const SatoriSettings = () => (
  <SchemaSettings links={[{ label: '文档', href: 'https://www.luckylillia.com/guide/develop#satori-%E5%8D%8F%E8%AE%AE' }]} />
)

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'satori', title: 'Satori', icon: 'cpu', component: SatoriSettings, order: 11, settings: true })
}

export default apply
