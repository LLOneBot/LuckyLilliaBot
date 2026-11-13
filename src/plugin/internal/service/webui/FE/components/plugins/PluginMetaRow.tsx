import React from 'react'
import type { PluginMetaRowProps } from '@luckylillia/plugin-sdk/webui'
import { CATEGORIES } from './listing'

const webLink = (url: string | undefined) => url && /^https?:\/\//i.test(url) ? url : undefined

export const PluginMetaRow: React.FC<PluginMetaRowProps> = ({ title, category, author, packageName, repository, children, className = '' }) => {
  const authorUrl = webLink(author?.url)
  const repositoryUrl = webLink(repository)
  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs text-theme-muted break-words [&>a]:min-w-0 [&>span]:min-w-0 ${className}`}>
      <span title="分类" className="rounded-full bg-theme-item px-2 py-0.5">{CATEGORIES.find(item => item.key === category)?.label ?? '其他'}</span>
      {author && (authorUrl
        ? <a href={authorUrl} target="_blank" rel="noopener noreferrer" title="作者" className="max-w-full hover:text-pink-500">{author.name}</a>
        : <span title="作者" className="max-w-full">{author.name}</span>)}
      {(packageName || repositoryUrl || !!children) && (
        <div className="flex shrink-0 items-center">
          {packageName && (
            <a href={`https://www.npmjs.com/package/${packageName}`} target="_blank" rel="noopener noreferrer" title="npm 包" aria-label={`${title} 的 npm 包`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:text-pink-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M0 0v24h24V0H0zm19.2 19.2h-2.4V7.2H12v12H4.8V4.8h14.4v14.4z" />
              </svg>
            </a>
          )}
          {repositoryUrl && (
            <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" title="源码仓库" aria-label={`${title} 的源码仓库`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:text-pink-500">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8" />
              </svg>
            </a>
          )}
          {children as React.ReactNode}
        </div>
      )}
    </div>
  )
}
