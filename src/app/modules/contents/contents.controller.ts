import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { contentsService } from './contents.service'
import sendResponse from '../../utils/sendResponse'

const createContents = catchAsync(async (req: Request, res: Response) => {
  const result = await contentsService.createContents(req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Content created successfully',
    data: result,
  })
})

// Get all contents
const getAllContents = catchAsync(async (req: Request, res: Response) => {
  const result = await contentsService.getAllContents(req.query)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Contents retrieved successfully',
    data: result.data[0],
  })
})

// Update contents
const updateContents = catchAsync(async (req: Request, res: Response) => {
  const result = await contentsService.updateContents(req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Content updated successfully',
    data: result,
  })
})

export const contentsController = {
  createContents,
  getAllContents,
  updateContents
}
