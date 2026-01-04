import { Model, Types } from 'mongoose'

export interface TContents {
  _id?: string
  aboutUs?: string
  termsAndConditions?: string
  privacyPolicy?: string
  supports?: string
  faq?: string
  paymentHoldDays?: number
  consultationFee?: number
  createdBy: Types.ObjectId
  isDeleted?: boolean
}

export type TContentsModel = Model<TContents, Record<string, unknown>>
