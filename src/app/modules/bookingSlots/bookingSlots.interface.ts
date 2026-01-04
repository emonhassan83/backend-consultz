import { Model, Types } from 'mongoose'

export type TBookingSlots = {
  _id?: string
  author: Types.ObjectId
  date: string
  time: string
}

export type TBookingSlotsModel = Model<TBookingSlots, Record<string, unknown>>
