import React from 'react'
import { SchemaSettings, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:milky'

const MilkySettings = () => (
  <SchemaSettings links={[{ label: '文档', href: 'https://www.luckylillia.com/guide/develop#milky-%E5%8D%8F%E8%AE%AE' }]} />
)

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'milky', title: 'Milky', icon: 'milk', component: MilkySettings, order: 12, settings: true })
}

export default apply
