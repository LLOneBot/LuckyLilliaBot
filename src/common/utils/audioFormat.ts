const SILK_HEADER = Buffer.from('#!SILK_V3')

/** Only sniffs the container header; actual packet validation belongs to the codec plugin. */
export function isSilk(data: Buffer): boolean {
  const offset = data[0] === 2 ? 1 : 0
  return data.subarray(offset, offset + SILK_HEADER.length).equals(SILK_HEADER)
}

export function isWav(data: Buffer): boolean {
  return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
}
