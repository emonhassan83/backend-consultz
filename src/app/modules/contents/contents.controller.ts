import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { contentsService } from './contents.service'
import sendResponse from '../../utils/sendResponse'

// Get single content by key
const getContent = catchAsync(async (req: Request, res: Response) => {
  const key = req.query.key as string
  const result = await contentsService.getContent(key)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Content ${key} retrieved successfully`,
    data: result,
  })
})

// Get all general contents
const getGeneralContents = catchAsync(async (req: Request, res: Response) => {
  const result = await contentsService.getGeneralContents()

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'General contents retrieved successfully',
    data: result,
  })
})

// Create or update single content
const createOrUpdateContent = catchAsync(async (req: Request, res: Response) => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key
  const result = await contentsService.createOrUpdate(key, req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Content created/updated successfully',
    data: result,
  })
})

// Update multiple general contents
const updateGeneralContents = catchAsync(async (req: Request, res: Response) => {
  const result = await contentsService.updateGenerals(req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.data,
  })
})

export const contentsController = {
  getContent,
  getGeneralContents,
  createOrUpdateContent,
  updateGeneralContents
}
