import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { ContentMetaService } from './contentMeta.service'

const createContentMeta = catchAsync(async (req, res) => {
  const result = await ContentMetaService.createContentMetaIntoDB(req.body)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Content meta create successfully!',
    data: result,
  })
})

const getAContentMeta = catchAsync(async (req, res) => {
  const result = await ContentMetaService.getAContentMetaFromDB(
    req.params.contentId,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Content meta retrieved successfully!',
    data: result,
  })
})

const updateContentMeta = catchAsync(async (req, res) => {
  const result = await ContentMetaService.updateAContentMetaFromDB(req.params?.id, req.body)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Content updated successfully!',
    data: result,
  })
})

const likeContent = catchAsync(async (req, res) => {
  const result = await ContentMetaService.likeContentFromDB(
    req.params.contentId,
    req.user,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Content like successfully!',
    data: result,
  })
})

const unlikeContent = catchAsync(async (req, res) => {
  const result = await ContentMetaService.unlikeContentFromDB(
    req.params.contentId,
    req.user,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Content unlike successfully!',
    data: result,
  })
})

export const ContentMetaControllers = {
  createContentMeta,
  getAContentMeta,
  updateContentMeta,
  likeContent,
  unlikeContent
}
