import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { SettingsLogsService } from './settingsLogs.service'

const getSettingsLogs = catchAsync(async (req, res) => {
  const result = await SettingsLogsService.getSettingsLogsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Settings logs retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

export const SettingsLogsControllers = {
  getSettingsLogs,
}
