// 无 schema 解析 protobuf, 结果为 {field_number: value}

interface ParsedObject {
  [key: number]: ParsedValue
}
type ParsedValue = number | bigint | string | ParsedObject | ParsedValue[]

const enum WireType {
  VARINT = 0,
  FIXED64 = 1,
  LENGTH_DELIMITED = 2,
  START_GROUP = 3,  // deprecated
  END_GROUP = 4,    // deprecated
  FIXED32 = 5,
}

class ProtobufParser {
  private data: Buffer
  private pos: number = 0

  constructor(data: Buffer) {
    this.data = data
  }

  private readVarint(): number | bigint {
    let result = 0n
    let shift = 0n

    while (this.pos < this.data.length) {
      const byte = this.data[this.pos++]
      result |= BigInt(byte & 0x7f) << shift

      if (!(byte & 0x80)) {
        if (result <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(result)
        }
        return result
      }
      shift += 7n
    }
    return Number(result)
  }

  private readFixed32(): number {
    const value = this.data.readUInt32LE(this.pos)
    this.pos += 4
    return value
  }

  private readFixed64(): bigint {
    const value = this.data.readBigUInt64LE(this.pos)
    this.pos += 8
    return value
  }

  private readBytes(length: number): Buffer {
    const data = this.data.slice(this.pos, this.pos + length)
    this.pos += length
    return data
  }

  private parseLengthDelimited(data: Buffer): string | Record<number, any> | string {
    try {
      const str = data.toString('utf-8')
      if (Buffer.from(str, 'utf-8').equals(data)) {
        return str
      }
    } catch { }

    try {
      const nested = new ProtobufParser(data).parse()
      if (Object.keys(nested).length > 0) {
        return nested
      }
    } catch { }

    return data.toString('hex')
  }

  parse(): Record<number, ParsedValue> {
    const result: Record<number, ParsedValue> = {}

    while (this.pos < this.data.length) {
      // 读取 tag (field_number << 3 | wire_type)
      const tag = this.readVarint()
      // 使用 BigInt 进行位运算以避免精度丢失
      const tagBig = typeof tag === 'bigint' ? tag : BigInt(tag)
      const fieldNumber = Number(tagBig >> 3n)
      const wireType = Number(tagBig & 7n)

      let value: ParsedValue

      switch (wireType) {
        case WireType.VARINT:
          value = this.readVarint()
          break

        case WireType.FIXED64:
          value = Number(this.readFixed64())
          break

        case WireType.LENGTH_DELIMITED: {
          const length = Number(this.readVarint())
          const data = this.readBytes(length)
          value = this.parseLengthDelimited(data)
          break
        }

        case WireType.FIXED32:
          value = this.readFixed32()
          break

        default:
          continue
      }

      if (fieldNumber in result) {
        if (!Array.isArray(result[fieldNumber])) {
          result[fieldNumber] = [result[fieldNumber]]
        }
        (result[fieldNumber] as ParsedValue[]).push(value)
      } else {
        result[fieldNumber] = value
      }
    }

    return result
  }
}

export function parseProtobuf(data: Buffer): Record<number, ParsedValue> {
  const parser = new ProtobufParser(data)
  return parser.parse()
}

export function parseProtobufFromHex(hexString: string): Record<number, ParsedValue> {
  const cleaned = hexString.replace(/^0x|\s/g, '')
  const buffer = Buffer.from(cleaned, 'hex')
  return parseProtobuf(buffer)
}
