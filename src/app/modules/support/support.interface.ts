import { Model, Types } from 'mongoose'
import { TAudience, TSupportStatus } from './support.constant'

export type TSupport = {
  _id?: string
  author: Types.ObjectId | string
  audience: TAudience
  email: string
  subject: string
  messages: string
  status: TSupportStatus
}

export type TSupportMessage = {
  _id?: string
  subject: string
  messages: string
}

export type TSupportModel = Model<TSupport, Record<string, unknown>>
