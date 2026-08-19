import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { PointsLogsService } from './pointsLogs.service'

const getUserPointsLogs = catchAsync(async (req, res) => {
  const result = await PointsLogsService.getUserPointsLogsFromDB(
    req.params.userId as string,
    req.query,
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'User points logs retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

export const PointsLogsControllers = {
  getUserPointsLogs,
}
