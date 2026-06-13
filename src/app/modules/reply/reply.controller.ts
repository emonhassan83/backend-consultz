import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { ReplyService } from './reply.service'
import sendResponse from '../../utils/sendResponse'

const createReply = catchAsync(async (req: Request, res: Response) => {
  const result = await ReplyService.createReply(req.body)

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Reply created successfully',
    data: result,
  })
})

const getAllReplyByComment = catchAsync(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    content: req.params.contentId,
  }
  const result = await ReplyService.getAllReply(query)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All Reply by content fetched successfully',
    meta: result?.meta,
    data: result?.data,
  })
})

const updateReply = catchAsync(async (req: Request, res: Response) => {
  const result = await ReplyService.updateReply(
    req.params.id as string,
    req.body,
    req?.user?._id,
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reply updated successfully',
    data: result,
  })
})

const deleteReply = catchAsync(async (req: Request, res: Response) => {
  const result = await ReplyService.deleteReply(
    req.params.id as string,
    req?.user?._id,
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reply deleted successfully',
    data: result,
  })
})

export const ReplyController = {
  createReply,
  getAllReplyByComment,
  updateReply,
  deleteReply,
}
