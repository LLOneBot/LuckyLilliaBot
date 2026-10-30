import { User } from '@satorijs/protocol'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  user_id: string
}

export const getUser: Handler<User, Payload> = (ctx, payload) => ntqq.getUser(ctx, payload.user_id)
