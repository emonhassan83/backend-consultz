import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import { bookingsService } from './booking.service'
import sendResponse from '../../utils/sendResponse'

const createBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.createBookings(req.body, req.user._id)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Bookings created successfully',
    data: result,
  })
})

const getConsultBookings = catchAsync(
  async (req: Request, res: Response) => {
    req.query['consult'] = req.user._id
    const result = await bookingsService.getAllBookings(req.query)
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Consult bookings fetched successfully',
      meta: result.meta,
      data: result.data,
    })
  },
)

const getMyBookings = catchAsync(async (req: Request, res: Response) => {
  req.query['user'] = req.user._id
  const result = await bookingsService.getAllBookings(req.query)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My booking fetched successfully',
    meta: result.meta,
    data: result.data,
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

const changeBookingStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.changeBookingStatus(req.params.id, req.body)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings status changed successfully',
    data: result,
  })
})

const rescheduleBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await bookingsService.rescheduleBooking(
    req.params.id,
    req.body,
    req.user._id
  )
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings reschedule successfully',
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
  deleteBookings,
  getConsultBookings,
  getMyBookings,
  changeBookingStatus,
  rescheduleBooking
}
