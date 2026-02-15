import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { TCategory } from './category.interface';
import { Category } from './category.model';
import httpStatus from 'http-status';

const insertIntoDB = async (payload: TCategory): Promise<TCategory> => {
  // Normalize title for comparison (lowercase + trim + single spaces)
  const normalizedInput = payload.title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  // Check if category with same normalized title already exists
  const existing = await Category.findOne({
    $expr: {
      $eq: [{ $toLower: '$title' }, normalizedInput],
    },
  }).lean();

  if (existing) {
    // Return existing category (no new entry)
    return existing;
  }

  // Create new category (store original title)
  const result = await Category.create({
    title: payload.title.trim(),
    items: payload.items
  });

  return result;
};

const getAllIntoFromDB = async () => {
  return await Category.find().select('title')
};

const getAFromDB = async (id: string): Promise<TCategory> => {
  const result = await Category.findById(id)
    .lean()
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found')
  }

  return result
}

const updateAIntoFromDB = async (
  id: string,
  payload: Partial<TCategory>,
): Promise<TCategory> => {
  const existing = await Category.findById(id);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found');
  }

  // If title is being updated → check for duplicate (case-insensitive)
  if (payload.title) {
    const normalizedInput = payload.title
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const duplicate = await Category.findOne({
      $expr: {
        $and: [
          { $eq: [{ $toLower: '$title' }, normalizedInput] },
          { _id: { $ne: id } },
        ],
      },
    });

    if (duplicate) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Another category with the same title already exists',
      );
    }
  }

  const updated = await Category.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).lean();

  if (!updated) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update category');
  }

  return updated;
};

const deleteFromDB = async (id: string): Promise<TCategory> => {
  const result = await Category.findByIdAndDelete(
    id
  ).lean()
  if (!result) {
    throw new AppError(httpStatus.CONFLICT, 'Category deletion failed!')
  }

  return result
}

export const CategoryService = {
  insertIntoDB,
  getAllIntoFromDB,
  getAFromDB,
  updateAIntoFromDB,
  deleteFromDB
}
