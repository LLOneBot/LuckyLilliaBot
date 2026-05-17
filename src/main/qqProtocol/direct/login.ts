/**
 * QR Code login flow for direct QQ protocol
 * Implements TransEmp31 (fetch QR) and TransEmp12 (poll status)
 */

import { DirectProtocolClient } from './client'
import { EncryptType } from './packet'
import { teaEncrypt } from './tea'
import { createHash, randomBytes } from 'node:crypto'

export enum QrCodeState {
  Waiting = 0,
  Scanned = 1,
  Confirmed = 2,
  Expired = 3,
  Cancelled = 4,
}

export interface QrCodeResult {
  url: string
  image: Buffer // PNG image data
  sig: Buffer
}

export interface QrPollResult {
  state: QrCodeState
  // Available when state === Confirmed
  uin?: string
  tgtgtKey?: Buffer
  noPicSig?: Buffer
  a1?: Buffer
}

/**
 * Fetch QR code from server (TransEmp31)
 */
export async function fetchQrCode(client: DirectProtocolClient): Promise<QrCodeResult> {
  // Build TransEmp31 request
  // This is a simplified version - actual implementation needs TLV packing
  const body = buildTransEmp31Request(client)

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    body,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp31Response(resp.payload)
}

/**
 * Poll QR code status (TransEmp12)
 */
export async function pollQrCode(client: DirectProtocolClient, sig: Buffer): Promise<QrPollResult> {
  const body = buildTransEmp12Request(client, sig)

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    body,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp12Response(resp.payload)
}

/**
 * Complete login after QR code confirmation (wtlogin.login)
 */
export async function loginWithQrResult(
  client: DirectProtocolClient,
  qrResult: QrPollResult,
): Promise<void> {
  if (!qrResult.a1 || !qrResult.tgtgtKey || !qrResult.uin) {
    throw new Error('QR poll result incomplete')
  }

  const body = buildLoginRequest(client, qrResult)

  const resp = await client.sendCommand(
    'wtlogin.login',
    body,
    EncryptType.EncryptEmpty,
    15000,
  )

  const session = parseLoginResponse(resp.payload, qrResult.tgtgtKey)
  client.setSession(session)
}

// --- Internal builders (simplified, need full TLV implementation) ---

function buildTransEmp31Request(client: DirectProtocolClient): Buffer {
  // TODO: Full TLV implementation matching Lagrange's QrLogin logic
  // For now this is a placeholder structure
  const parts: Buffer[] = []

  // Command header: 0x0031
  const header = Buffer.alloc(2)
  header.writeUInt16BE(0x0031)
  parts.push(header)

  // App ID
  const appId = Buffer.alloc(8)
  appId.writeBigUInt64BE(BigInt(1600001615))
  parts.push(appId)

  // GUID
  parts.push(client.getGuid())

  // ECDH public key
  parts.push(client.getEcdhPublicKey())

  return Buffer.concat(parts)
}

function parseTransEmp31Response(data: Buffer): QrCodeResult {
  // TODO: Full response parsing
  // This is a placeholder that needs proper TLV unpacking
  return {
    url: '',
    image: Buffer.alloc(0),
    sig: Buffer.alloc(0),
  }
}

function buildTransEmp12Request(client: DirectProtocolClient, sig: Buffer): Buffer {
  // TODO: Full implementation
  const parts: Buffer[] = []
  const header = Buffer.alloc(2)
  header.writeUInt16BE(0x0012)
  parts.push(header)
  parts.push(sig)
  return Buffer.concat(parts)
}

function parseTransEmp12Response(data: Buffer): QrPollResult {
  // TODO: Full TLV parsing for poll response
  return { state: QrCodeState.Waiting }
}

function buildLoginRequest(client: DirectProtocolClient, qrResult: QrPollResult): Buffer {
  // TODO: Full wtlogin.login request with TLVs
  return Buffer.alloc(0)
}

function parseLoginResponse(data: Buffer, tgtgtKey: Buffer): any {
  // TODO: Parse login response, extract D2/D2Key/TGT/etc
  return {}
}
