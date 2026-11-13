/** NTQQ used the product name as its platform key before it was renamed to the protocol name. */
export function normalizePlatform(platform: string): string {
  return platform === 'luckylillia' ? 'ntqq' : platform
}

/** Only rewrite the complete legacy platform prefix; ids and unrelated names remain untouched. */
export function normalizePlatformId(id: string): string {
  return id.startsWith('luckylillia:') ? `ntqq:${id.slice('luckylillia:'.length)}` : id
}
