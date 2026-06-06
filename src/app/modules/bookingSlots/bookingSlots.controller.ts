import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { BookingSlotsService } from './bookingSlots.service'

const createBookingSlot = catchAsync(async (req, res) => {
  const result = await BookingSlotsService.insertIntoDB(req.body, req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: result.message,
    data: result.data,
  })
})

const getAllBookingSlots = catchAsync(async (req, res) => {
  req.query['author'] = req.params.userId
  const result = await BookingSlotsService.getAllIntoFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Booking slots retrieved successfully!',
    data: result,
  })
})

const getABookingSlots = catchAsync(async (req, res) => {
  const result = await BookingSlotsService.getAIntoFromDB(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Booking slots retrieved successfully!',
    data: result,
  })
})

export const BookingSlotsControllers = {
  createBookingSlot,
  getAllBookingSlots,
  getABookingSlots
}
