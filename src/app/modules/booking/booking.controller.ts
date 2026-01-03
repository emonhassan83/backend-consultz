import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import { bookingsService } from './booking.service'
import sendResponse from '../../utils/sendResponse'

const createBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.createBookings(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Bookings created successfully',
    data: result,
  })
})

const getAllBookingsWithReference = catchAsync(
  async (req: Request, res: Response) => {
    req.query['session'] = req.params.referenceId
    const result = await bookingsService.getAllBookings(req.query)
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'All bookings with reference fetched successfully',
      meta: result.meta,
      data: result.data,
    })
  },
)

const getMyBookings = catchAsync(async (req: Request, res: Response) => {
  req.query['user'] = req.user._id
  const result = await bookingsService.getMyBookings(req.query)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My booking fetched successfully',
    meta: result.meta,
    data: result.result,
  })
})

const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.getAllBookings(req.query)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All bookings fetched successfully',
    meta: result.meta,
    data: result.data,
  })
})

const getBookingsById = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.getBookingsById(req.params.id)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings fetched successfully',
    data: result,
  })
})

const updateBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.updateBookings(req.params.id, req.body)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings updated successfully',
    data: result,
  })
})

const cancelBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.cancelBooking(req.params.id)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings canceled successfully',
    data: result,
  })
})

const rescheduleBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.rescheduleBooking(
    req.params.id,
    req.body,
  )
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings reschedule successfully',
    data: result,
  })
})

const completeBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.completeBooking(req.params.id)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings completed successfully',
    data: result,
  })
})

const deleteBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.deleteBookings(req.params.id)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings deleted successfully',
    data: result,
  })
})

export const bookingsController = {
  createBookings,
  getAllBookings,
  getBookingsById,
  updateBookings,
  deleteBookings,
  getAllBookingsWithReference,
  getMyBookings,
  completeBooking,
  cancelBooking,
  rescheduleBooking
}
