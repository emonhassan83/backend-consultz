import { Model, Types } from 'mongoose'

export type TSubCategory = {
  _id?: string
  category: Types.ObjectId
  title: string
  items: string[]
}

export type TSubCategoryModel = Model<TSubCategory, Record<string, unknown>>
