/**
 * 简单的 Protobuf 解析工具
 * 将任意 Protobuf 二进制数据解析为 {field_number: value} 格式
 */

type ParsedValue = number | bigint | string | Record<number, ParsedValue> | ParsedValue[]

// Wire types
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

  /**
   * 读取 varint 编码的整数
   * 使用 BigInt 处理超大数字，最后根据大小返回 number 或 bigint
   */
  private readVarint(): number | bigint {
    let result = 0n
    let shift = 0n

    while (this.pos < this.data.length) {
      const byte = this.data[this.pos++]
      result |= BigInt(byte & 0x7f) << shift

      if (!(byte & 0x80)) {
        // 如果数字在安全整数范围内，返回 number，否则返回 bigint
        if (result <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(result)
        }
        return result
      }
      shift += 7n
    }
    return Number(result)
  }

  /**
   * 读取 32 位固定长度整数
   */
  private readFixed32(): number {
    const value = this.data.readUInt32LE(this.pos)
    this.pos += 4
    return value
  }

  /**
   * 读取 64 位固定长度整数
   */
  private readFixed64(): bigint {
    const value = this.data.readBigUInt64LE(this.pos)
    this.pos += 8
    return value
  }

  /**
   * 读取指定长度的字节
   */
  private readBytes(length: number): Buffer {
    const data = this.data.slice(this.pos, this.pos + length)
    this.pos += length
    return data
  }

  /**
   * 尝试解析 length-delimited 字段
   */
  private parseLengthDelimited(data: Buffer): string | Record<number, any> | string {
    // 尝试解析为 UTF-8 字符串
    try {
      const str = data.toString('utf-8')
      // 检查是否是有效的 UTF-8
      if (Buffer.from(str, 'utf-8').equals(data)) {
        return str
      }
    } catch { }

    // 尝试解析为嵌套消息
    try {
      const nested = new ProtobufParser(data).parse()
      if (Object.keys(nested).length > 0) {
        return nested
      }
    } catch { }

    // 否则返回十六进制字符串
    return data.toString('hex')
  }

  /**
   * 解析 Protobuf 数据
   */
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

      // 根据 wire type 解析值
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
          // 不支持的 wire type，跳过
          continue
      }

      // 处理重复字段（将其转为数组）
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

/**
 * 解析 Protobuf 二进制数据
 * @param data Protobuf 二进制数据
 * @returns 字典,键为字段编号,值为解析后的值
 */
export function parseProtobuf(data: Buffer): Record<number, ParsedValue> {
  const parser = new ProtobufParser(data)
  return parser.parse()
}

/**
 * 从十六进制字符串解析 Protobuf 数据
 * @param hexString 十六进制字符串 (可选 0x 前缀)
 * @returns 字典,键为字段编号,值为解析后的值
 */
export function parseProtobufFromHex(hexString: string): Record<number, ParsedValue> {
  // 移除可能的 0x 前缀和空格
  const cleaned = hexString.replace(/^0x|\s/g, '')
  const buffer = Buffer.from(cleaned, 'hex')
  return parseProtobuf(buffer)
}
