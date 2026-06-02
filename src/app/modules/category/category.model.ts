import { Schema, model } from 'mongoose'
import { TCategory, TCategoryModel } from './category.interface'

const categorySchema = new Schema<TCategory>(
  {
    title: {
      type: String,
      required: [true, 'Category title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    items: {
      type: [String],
      validate: {
        validator: (v: string[]) => v.every(item => typeof item === 'string' && item.trim().length > 0),
        message: 'All items must be non-empty strings',
      },
    },
  }
);

categorySchema.index({ title: 'text' });

export const Category = model<TCategory, TCategoryModel>(
  'Category',
  categorySchema,
)
