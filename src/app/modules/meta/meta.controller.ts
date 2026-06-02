import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { MetaService } from './meta.service'

const fetchDashboardMetaData = catchAsync(async (req, res) => {
  const result = await MetaService.fetchDashboardMetaData(req.query, req.user._id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Meta data retrieval successfully!',
    data: result,
  })
})

const analysisReportingMetaData = catchAsync(async (req, res) => {
  const result = await MetaService.analysisReportingMetaData(req.query, req.user._id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Analysis reporting meta data retrieval successfully!',
    data: result,
  })
})

const paymentTransactionMetaData = catchAsync(async (req, res) => {
  const result = await MetaService.paymentTransactionMetaData(req.query, req.user._id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment transaction meta data retrieval successfully!',
    meta: result.meta,
    data: result.data,
  })
})

export const MetaController = {
  fetchDashboardMetaData,
  analysisReportingMetaData,
  paymentTransactionMetaData
}
