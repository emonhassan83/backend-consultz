import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { CategoryService } from './category.service'

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await CategoryService.insertIntoDB(req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Category data insert successfully",
    data: result,
  })
})

const getAllCategory = catchAsync(async (req, res) => {
  const result = await CategoryService.getAllIntoFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

const getACategory = catchAsync(async (req, res) => {
  const result = await CategoryService.getAFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Category retrieved successfully!',
    data: result,
  })
})

const updateACategory = catchAsync(async (req, res) => {
  const result = await CategoryService.updateAIntoFromDB(req.params.id, req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories update successfully!',
    data: result,
  })
})

const deleteACategory = catchAsync(async (req, res) => {
  const result = await CategoryService.deleteFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories deleted successfully!',
    data: result,
  })
})

export const CategoryControllers = {
  insertIntoDB,
  getAllCategory,
  getACategory,
  updateACategory,
  deleteACategory
}
