import { Model, Types } from 'mongoose'
import { TSupportStatus } from './support.constant'

export type TSupport = {
  _id?: string
  author: Types.ObjectId | string
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
