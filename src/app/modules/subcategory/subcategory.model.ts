import { Schema, model } from 'mongoose';
import { TSubCategory, TSubCategoryModel } from './subcategory.interface';

const subCategorySchema = new Schema<TSubCategory>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Subcategory title is required'],
      trim: true
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

// Text index for search on title
subCategorySchema.index({ title: 'text' });

// Compound index: prevent duplicate title under same category (case-insensitive check handled in service)
subCategorySchema.index({ category: 1, title: 1 });

export const SubCategory = model<TSubCategory, TSubCategoryModel>(
  'SubCategory',
  subCategorySchema,
);