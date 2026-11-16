import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { PointsService } from './points.service'

const getAllRules = catchAsync(async (_req, res) => {
  const result = await PointsService.getAllRulesFromDB()
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Points rules retrieved successfully',
    data: result,
  })
})

const getRule = catchAsync(async (req, res) => {
  const result = await PointsService.getRuleFromDB(req.params.key as string)
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Points rule retrieved successfully',
    data: result,
  })
})

const updateRule = catchAsync(async (req, res) => {
  const result = await PointsService.updateRuleFromDB(
    req.params.key as string,
    req.body,
    req.user._id,
  )
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Points rule updated successfully',
    data: result,
  })
})

const toggleEnabled = catchAsync(async (req, res) => {
  const result = await PointsService.toggleRuleEnabledFromDB(
    req.params.key as string,
    req.body.enabled,
    req.user._id,
  )
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Points rule enabled status updated successfully',
    data: result,
  })
})

const getUserSummary = catchAsync(async (req, res) => {
  const result = await PointsService.getUserSummaryFromDB(
    req.params.userId as string,
  )
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Points summary retrieved successfully',
    data: result,
  })
})

const setAttribution = catchAsync(async (req, res) => {
  const result = await PointsService.setAttributionFromDB(
    req.user._id,
    req.body.expertRef,
  )
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.alreadySet
      ? 'Expert attribution already set'
      : 'Expert attribution saved successfully',
    data: result,
  })
})

export const PointsControllers = {
  getAllRules,
  getRule,
  updateRule,
  toggleEnabled,
  getUserSummary,
  setAttribution,
}
