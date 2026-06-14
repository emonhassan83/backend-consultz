import { Model, Types } from 'mongoose'
import { TUser } from '../user/user.interface'

export interface TComments {
  user: Types.ObjectId | TUser
  content: Types.ObjectId
  comment: string
  isReply: boolean
  replyRef?: Types.ObjectId | string
  reply: Types.ObjectId[] | TComments
}

export type TCommentsModules = Model<TComments, Record<string, unknown>>
