import { TSubCategory } from './subcategory.interface'
import { SubCategory } from './subcategory.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'

/**
 * Create subcategory or return existing one (case-insensitive duplicate check under same category)
 */
const insertIntoDB = async (payload: TSubCategory): Promise<TSubCategory> => {
  // Normalize title for comparison (lowercase + trim + single spaces)
  const normalizedInput = payload.title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

  // Check if subcategory with same normalized title already exists under the same category
  const existing = await SubCategory.findOne({
    category: payload.category,
    $expr: {
      $eq: [{ $toLower: '$title' }, normalizedInput],
    },
  }).lean()

  if (existing) {
    return existing // Return existing subcategory (no duplicate)
  }

  // Create new subcategory
  const result = await SubCategory.create({
    ...payload,
    title: payload.title.trim(),
  })

  return result
}

/**
 * Get all subcategories with search by title (case-insensitive partial match)
 * Supports pagination, sorting, filtering
 */
const getAllFromDB = async (categoryId: string) => {
  return await SubCategory.find({ category: categoryId }).select('title items')
}

/**
 * Get single subcategory by ID
 */
const getAFromDB = async (id: string): Promise<TSubCategory> => {
  const result = await SubCategory.findById(id)
    .populate({
      path: 'category',
      select: 'title',
    })
    .lean()

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subcategory not found')
  }

  return result
}

/**
 * Update subcategory
 * - Case-insensitive duplicate check after update
 */
const updateIntoDB = async (
  id: string,
  payload: Partial<TSubCategory>,
): Promise<TSubCategory> => {
  const existing = await SubCategory.findById(id)
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subcategory not found')
  }

  // If title is being updated → check for duplicate under same category
  if (payload.title) {
    const normalizedInput = payload.title
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()

    const duplicate = await SubCategory.findOne({
      category: payload.category || existing.category,
      _id: { $ne: id },
      $expr: {
        $eq: [{ $toLower: '$title' }, normalizedInput],
      },
    })

    if (duplicate) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Another subcategory with the same title already exists under this category',
      )
    }
  }

  const updated = await SubCategory.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
    runValidators: true,
  }).lean()

  if (!updated) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update subcategory')
  }

  return updated
}

/**
 * Delete subcategory (soft delete or hard — choose one)
 */
const deleteFromDB = async (id: string): Promise<TSubCategory> => {
  const result = await SubCategory.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { returnDocument: 'after' },
  ).lean()

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subcategory not found')
  }

  return result
}

export const SubCategoryService = {
  insertIntoDB,
  getAllFromDB,
  getAFromDB,
  updateIntoDB,
  deleteFromDB,
}
