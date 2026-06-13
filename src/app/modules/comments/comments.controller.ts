import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { commentsService } from './comments.service'
import sendResponse from '../../utils/sendResponse'

const createComments = catchAsync(async (req: Request, res: Response) => {
  const result = await commentsService.createComments(req.body, req.user._id)

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Comments created successfully',
    data: result,
  })
})

const getAllComments = catchAsync(async (req: Request, res: Response) => {
  const result = await commentsService.getAllComments(req.user._id, req.query)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All comments fetched successfully',
    meta: result?.meta,
    data: result?.data,
  })
})

const getAllCommentsByContent = catchAsync(
  async (req: Request, res: Response) => {
    const query = {
      ...req.query,
      content: req.params.contentId,
    }
    const result = await commentsService.getAllComments(req.user._id, query)

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'All comments by content fetched successfully',
      meta: result?.meta,
      data: result?.data,
    })
  },
)

const getCommentsById = catchAsync(async (req: Request, res: Response) => {
  const result = await commentsService.getCommentsById(
    req.user._id,
    req.params.id as string,
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Comments fetched successfully',
    data: result,
  })
})

const updateComments = catchAsync(async (req: Request, res: Response) => {
  const result = await commentsService.updateComments(
    req.params.id as string,
    req.body,
    req?.user?._id,
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Comments updated successfully',
    data: result,
  })
})

const deleteComments = catchAsync(async (req: Request, res: Response) => {
  const result = await commentsService.deleteComments(
    req.params.id as string,
    req?.user?._id,
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Comments deleted successfully',
    data: result,
  })
})

export const commentsController = {
  createComments,
  getAllComments,
  getAllCommentsByContent,
  getCommentsById,
  updateComments,
  deleteComments,
}
