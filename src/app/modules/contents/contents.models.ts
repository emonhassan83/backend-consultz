import { Schema, model } from 'mongoose'
import { TContents, TContentsModel } from './contents.interface'

const contentsSchema = new Schema<TContents>({
  key: {
    type: String,
    required: [true, 'Key is required'],
    unique: true,
    trim: true,
  },
  value: {
    type: Schema.Types.Mixed,
    required: [true, 'Value is required'],
  },
})

export const Contents = model<TContents, TContentsModel>(
  'Contents',
  contentsSchema,
)
