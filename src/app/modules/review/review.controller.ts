import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import { reviewsService } from './review.service'
import sendResponse from '../../utils/sendResponse'

const createReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewsService.createReviews(req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews created successfully',
    data: result,
  })
})

const getAllReviewsWithReference = catchAsync(
  async (req: Request, res: Response) => {
    req.query['reference'] = req.params.referenceId
    const result = await reviewsService.getAllReviews(req.query)
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'All bookings with reference fetched successfully',
      meta: result.meta,
      data: result.data,
    })
  },
)

const getReviewsById = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewsService.getReviewsById(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews fetched successfully',
    data: result,
  })
})

const updateReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewsService.updateReviews(req.params.id, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews updated successfully',
    data: result,
  })
})

const deleteReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewsService.deleteReviews(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews deleted successfully',
    data: result,
  })
})

export const reviewsController = {
  createReviews,
  getAllReviewsWithReference,
  getReviewsById,
  updateReviews,
  deleteReviews,
}
