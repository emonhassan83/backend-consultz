import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TBookingSlots } from './bookingSlots.interface'
import { BookingSlots } from './bookingSlots.model'
import { User } from '../user/user.model'

const insertIntoDB = async (payload: TBookingSlots) => {
  const { author: authorId } = payload

  const user = await User.findById(authorId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.CONFLICT, 'Session is not found!')
  }

  const slots = await BookingSlots.create(payload)
  if (!slots) {
    throw new AppError(httpStatus.CONFLICT, 'Session slots not created!')
  }

  return slots
}

const getAllIntoFromDB = async (query: Record<string, unknown>) => {
  const BookingSlotsQuery = new QueryBuilder(BookingSlots.find(), query)
    .search([''])
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await BookingSlotsQuery.modelQuery
  const meta = await BookingSlotsQuery.countTotal()

  return {
    meta,
    result,
  }
}

const getAIntoFromDB = async (id: string) => {
  const slot = await BookingSlots.findById(id)
  if (!slot) {
    throw new AppError(httpStatus.NOT_FOUND, 'Session slots not found')
  }

  return slot
}

export const BookingSlotsService = {
  insertIntoDB,
  getAllIntoFromDB,
  getAIntoFromDB,
}
