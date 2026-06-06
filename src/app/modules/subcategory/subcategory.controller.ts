import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { SubCategoryService } from './subcategory.service'

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await SubCategoryService.insertIntoDB(req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'SubCategory data insert successfully',
    data: result,
  })
})

const getAllSubCategory = catchAsync(async (req, res) => {
  const result = await SubCategoryService.getAllFromDB(req.params.categoryId as string)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'SubCategories retrieved successfully!',
    data: result,
  })
})

const getACategory = catchAsync(async (req, res) => {
  const result = await SubCategoryService.getAFromDB(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Sub category retrieved successfully!',
    data: result,
  })
})

const updateACategory = catchAsync(async (req, res) => {
  const result = await SubCategoryService.updateIntoDB(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories update successfully!',
    data: result,
  })
})

const deleteAFromDB = catchAsync(async (req, res) => {
  const result = await SubCategoryService.deleteFromDB(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories deleted successfully!',
    data: result,
  })
})

export const SubCategoryControllers = {
  insertIntoDB,
  getAllSubCategory,
  getACategory,
  updateACategory,
  deleteAFromDB,
}
