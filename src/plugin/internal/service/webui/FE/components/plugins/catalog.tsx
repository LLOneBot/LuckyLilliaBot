import React, { useCallback, useMemo, useState } from 'react'
import type { PluginCatalogProps, PluginCatalogState } from '@luckylillia/plugin-sdk/webui'
import { PluginBoundary } from '../../plugin-host/context'
import { contributionKey, type SlotContribution } from '../../plugin-host/registry'
import { useSlotContents } from '../../plugin-host/views'

export interface CatalogSource {
  key: string
  state: PluginCatalogState
}

const CatalogBridge: React.FC<{
  contribution: SlotContribution
  loadCatalog: boolean
  onChange(key: string, state: PluginCatalogState | null): void
}> = ({ contribution, loadCatalog, onChange }) => {
  const key = contributionKey(contribution)
  const change = useCallback<PluginCatalogProps['onChange']>(state => onChange(key, state), [key, onChange])
  const Component = contribution.component
  return (
    <PluginBoundary owner={contribution.owner} failure={{ key, where: '插件目录' }} inline>
      <Component loadCatalog={loadCatalog} onChange={change} />
    </PluginBoundary>
  )
}

/** Catalog plugins supply data and operations; the host owns every filter and card. */
export function usePluginCatalog(loadCatalog: boolean) {
  const contributions = useSlotContents('plugins.catalog')
  const [snapshots, setSnapshots] = useState<Record<string, PluginCatalogState>>({})
  const onChange = useCallback((key: string, state: PluginCatalogState | null) => {
    setSnapshots(previous => {
      if (state === previous[key] || (!state && !previous[key])) return previous
      const next = { ...previous }
      if (state) next[key] = state
      else delete next[key]
      return next
    })
  }, [])
  const sources = useMemo<CatalogSource[]>(() => contributions.flatMap(contribution => {
    const key = contributionKey(contribution)
    return snapshots[key] ? [{ key, state: snapshots[key] }] : []
  }), [contributions, snapshots])
  return {
    available: contributions.length > 0,
    sources,
    bridge: contributions.map(contribution => <CatalogBridge key={contributionKey(contribution)} contribution={contribution} loadCatalog={loadCatalog} onChange={onChange} />),
  }
}
