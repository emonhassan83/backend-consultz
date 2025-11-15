import { Model, Types } from 'mongoose'
import { TUser } from '../user/user.interface'
import { TComments } from '../comments/comments.interface'

export interface TReply {
  user: Types.ObjectId | TUser
  replyRef: Types.ObjectId | TComments
  comment: string
}

export type TReplyModules = Model<TReply, Record<string, unknown>>
