import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { FeedService } from './feed.service'

const createFeed = catchAsync(async (req, res) => {
  const files =
    req.files && !Array.isArray(req.files)
      ? (req.files['content'] as Express.Multer.File[])
      : []

  const result = await FeedService.createFeedIntoDB(req.body, files)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Feed post create successfully!',
    data: result,
  })
})

const getAllFeeds = catchAsync(async (req, res) => {
  const result = await FeedService.getAllFeedsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed posts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAllFeedsByUserId = catchAsync(async (req, res) => {
  req.query['author'] = req?.params?.userId
  const result = await FeedService.getAllFeedsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed posts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAllMyFeed = catchAsync(async (req, res) => {
  req.query['author'] = req?.user?._id
  const result = await FeedService.getAllFeedsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My feed posts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAFeed = catchAsync(async (req, res) => {
  const result = await FeedService.getAFeedFromDB(req.params.id, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed post retrieved successfully!',
    data: result,
  })
})

const updateFeed = catchAsync(async (req, res) => {
  const files =
    req.files && !Array.isArray(req.files)
      ? (req.files['content'] as Express.Multer.File[])
      : []

  const result = await FeedService.updateFeedFromDB(
    req.params.id,
    req.body,
    files
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed post update successfully!',
    data: result,
  })
})

const deleteAFeed = catchAsync(async (req, res) => {
  const result = await FeedService.deleteAFeedFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed post delete successfully!',
    data: result,
  })
})

export const FeedControllers = {
  createFeed,
  getAllFeeds,
  getAllMyFeed,
  getAllFeedsByUserId,
  getAFeed,
  updateFeed,
  deleteAFeed,
}
