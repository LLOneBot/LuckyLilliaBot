import { QQProtocolBase } from './base'
import { NativeQQProtocol } from './nativeQQ'
import { DirectQQProtocol } from './direct'
import { FriendMixin, GroupMixin, MediaMixin, MessageMixin, SystemMixin, UserMixin } from './mixins'

export type {
  PBData,
  NativeQQResSendPB,
  NativeQQResRecvPB,
  NativeQQReqSendPB,
  NativeQQRes,
  NativeQQReq,
  ResListener,
  QQResourceUsage,
} from './types'

export { QQProtocolBase } from './base'
export { NativeQQProtocol } from './nativeQQ'
export { DirectQQProtocol } from './direct'


type Constructor<T = object> = abstract new (...args: any[]) => T

type Mixin<TBase extends Constructor> = (Base: TBase) => Constructor

type MixinInstance<T> = T extends (Base: any) => infer R
  ? R extends Constructor<infer I> ? I : never
  : never

type MergeMixins<TBase, TMixins extends readonly Mixin<any>[]> = TMixins extends readonly [
  infer First extends Mixin<any>,
  ...infer Rest extends readonly Mixin<any>[],
]
  ? MergeMixins<TBase & MixinInstance<First>, Rest>
  : TBase

function applyMixins<TBase extends new (...args: any[]) => object, TMixins extends readonly Mixin<any>[]>(
  Base: TBase,
  mixins: TMixins,
): new (...args: ConstructorParameters<TBase>) => MergeMixins<InstanceType<TBase>, TMixins> {
  return mixins.reduce<any>((acc, mixin) => mixin(acc), Base)
}


const mixins = [GroupMixin, FriendMixin, MediaMixin, MessageMixin, UserMixin, SystemMixin] as const

export const DirectQQProtocolClient = applyMixins(DirectQQProtocol, mixins)
export const NativeQQProtocolClient = applyMixins(NativeQQProtocol, mixins)

// 两个实现的 InstanceType 取 union 会推成 never, 所以用抽象 base 合并 mixin 的类型
type QQProtocolInstance = MergeMixins<QQProtocolBase, typeof mixins>
declare module 'cordis' {
  interface Context {
    qqProtocol: QQProtocolInstance
  }
}
