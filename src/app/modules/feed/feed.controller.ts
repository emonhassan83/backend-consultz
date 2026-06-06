import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { FeedService } from './feed.service'
import { FEED_STATUS } from './feed.constant'

const createFeed = catchAsync(async (req, res) => {
  const files =
    req.files && !Array.isArray(req.files)
      ? (req.files['content'] as Express.Multer.File[])
      : []

  const result = await FeedService.createFeedIntoDB(
    req.body,
    req.user._id,
    files,
  )

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
    data: result.data,
  })
})

const getActiveFeeds = catchAsync(async (req, res) => {
  req.query['status'] = FEED_STATUS.active
  const result = await FeedService.getAllFeedsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed active posts retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

const getAllFeedsByUserId = catchAsync(async (req, res) => {
  req.query['author'] = req?.params?.userId
  req.query['status'] = FEED_STATUS.active
  const result = await FeedService.getAllFeedsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed posts retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

const getAllMyFeed = catchAsync(async (req, res) => {
  req.query.author = req.user._id
  req.query['status'] = FEED_STATUS.active
  const result = await FeedService.getAllFeedsFromDB(
    req.query,
    req.user._id.toString(),
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My feed posts retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

const getAFeed = catchAsync(async (req, res) => {
  const result = await FeedService.getAFeedFromDB(req.params.id as string, req.user._id)

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
    req.params.id as string,
    req.body,
    files,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed post update successfully!',
    data: result,
  })
})

const changeFeedStatus = catchAsync(async (req, res) => {
  const result = await FeedService.changeFeedStatus(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Feed status changed successfully!',
    data: result,
  })
})

const deleteAFeed = catchAsync(async (req, res) => {
  const result = await FeedService.deleteAFeedFromDB(req.params.id as string)

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
  getActiveFeeds,
  getAllMyFeed,
  getAllFeedsByUserId,
  getAFeed,
  updateFeed,
  changeFeedStatus,
  deleteAFeed,
}
