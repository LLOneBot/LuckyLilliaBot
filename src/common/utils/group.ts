/**
 * 把"用户看到的群号"（group_code）转成 QQ 内部的 group_uin。
 * 部分 highway/老协议字段（比如 GroupAvatarExtra.groupUin）要的是 group_uin，
 * 错传 group_code 服务器会拒。映射表是 QQ 协议固有的。
 */
export function groupCodeToGroupUin(groupCode: number): number {
  let left = Math.floor(groupCode / 1000000)
  if (left >= 0 && left <= 10) left += 202
  else if (left >= 11 && left <= 19) left += 480 - 11
  else if (left >= 20 && left <= 66) left += 2100 - 20
  else if (left >= 67 && left <= 156) left += 2010 - 67
  else if (left >= 157 && left <= 209) left += 2147 - 157
  else if (left >= 210 && left <= 309) left += 4100 - 210
  else if (left >= 310 && left <= 499) left += 3800 - 310
  return left * 1000000 + (groupCode % 1000000)
}
