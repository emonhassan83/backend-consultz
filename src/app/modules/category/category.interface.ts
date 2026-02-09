import { Model, Types } from 'mongoose'

export type TCategory = {
  _id?: string
  title: string
}

export type TCategoryModel = Model<TCategory, Record<string, unknown>>
