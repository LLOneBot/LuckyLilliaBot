export interface OwnerRow {
  platform: string
  userId: string
}

/** The stored form is either a bare user id or platform:userId; ids may themselves contain colons. */
export function parseOwner(value: string): OwnerRow {
  const colon = value.indexOf(':')
  return colon > 0
    ? { platform: value.slice(0, colon), userId: value.slice(colon + 1) }
    : { platform: '', userId: value }
}

/** Keep incomplete input in the draft. The host normalizes blank rows when saving. */
export function formatOwner({ platform, userId }: OwnerRow): string {
  return platform ? `${platform}:${userId}` : userId
}
