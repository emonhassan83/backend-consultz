import { Model, Types } from 'mongoose'

export interface TContents {
  _id?: string
  termsAndConditions?: string
  paymentHoldDays?: number
  consultationFee?: number
  supportEmail?: string
  isDeleted?: boolean
}

export type TContentsModel = Model<TContents, Record<string, unknown>>
