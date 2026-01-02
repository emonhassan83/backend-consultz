import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { chatService } from './chat.service'

const createChat = catchAsync(async (req: Request, res: Response) => {
  const chat = await chatService.createChat(req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat created successfully',
    data: chat,
  })
})

const getMyChatList = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.getMyChatList(req.user._id, req.query)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat retrieved successfully',
    data: result,
  })
})

const getChatById = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.getChatById(req.params.id)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat retrieved successfully',
    data: result,
  })
})

const getChatByUserId = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.getChatByUserId(req?.user._id, req.params.userId)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat retrieved successfully',
    data: result,
  })
})

const updateChat = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.updateChatList(req.params.id, req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat updated successfully',
    data: result,
  })
})

const deleteChat = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.deleteChatList(req.params.id)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Chat deleted successfully',
    data: result,
  })
})

export const chatController = {
  createChat,
  getMyChatList,
  getChatByUserId,
  getChatById,
  updateChat,
  deleteChat,
}
