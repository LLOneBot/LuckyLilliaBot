import { QQProtocolBase } from './base'
import { FriendMixin, GroupMixin, MediaMixin, MessageMixin, SystemMixin, UserMixin } from './mixins'

export type {
  PBData,
  PMHQResSendPB,
  PMHQResRecvPB,
  PMHQReqSendPB,
  PMHQRes,
  PMHQReq,
  ResListener,
} from './types'


type Constructor<T = object> = new (...args: any[]) => T

type Mixin<TBase extends Constructor> = (Base: TBase) => Constructor

// 从 Mixin 函数提取返回的类实例类型
type MixinInstance<T> = T extends (Base: any) => infer R
  ? R extends Constructor<infer I> ? I : never
  : never

// 递归合并 Mixin 数组的类型
type MergeMixins<TBase, TMixins extends readonly Mixin<any>[]> = TMixins extends readonly [
  infer First extends Mixin<any>,
  ...infer Rest extends readonly Mixin<any>[],
]
  ? MergeMixins<TBase & MixinInstance<First>, Rest>
  : TBase

// 带类型推导的 applyMixins
function applyMixins<TBase extends Constructor, TMixins extends readonly Mixin<any>[]>(
  Base: TBase,
  mixins: TMixins,
): Constructor<MergeMixins<InstanceType<TBase>, TMixins>> {
  return mixins.reduce<Constructor>((acc, mixin) => mixin(acc), Base) as Constructor<MergeMixins<InstanceType<TBase>, TMixins>>
}


/**
 * QQProtocolClient - 通过 Mixin 模式组合所有协议功能
 */
const mixins = [GroupMixin, FriendMixin, MediaMixin, MessageMixin, UserMixin, SystemMixin] as const
export const QQProtocolClient = applyMixins(QQProtocolBase, mixins)

declare module 'cordis' {
  interface Context {
    qqProtocol: InstanceType<typeof QQProtocolClient>
  }
}
