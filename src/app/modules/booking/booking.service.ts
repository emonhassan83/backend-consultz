import mongoose from 'mongoose'
import httpStatus from 'http-status'
import { TBookings } from './booking.interface'
import moment from 'moment'
import { BOOKING_STATUS } from './booking.constants'
import { Session } from '../Session/session.model'
import AppError from '../../errors/AppError'
import { Booking } from './booking.models'
import { User } from '../User/user.model'
import {
  bookingsOnendNotifyToUsers,
  sendBookingsNotification,
} from './booking.utils'
import { SessionSlots } from '../SessionSlots/sessionSlots.model'
import QueryBuilder from '../../builder/QueryBuilder'

const createBookings = async (payload: TBookings) => {
  const sessionClient = await mongoose.startSession()
  sessionClient.startTransaction()

  try {
    const { user, session: sessionId, slot } = payload

    // Find the user
    const userData = await User.findById(user).session(sessionClient)
    if (!userData || userData.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User not found!')
    }

    // Find the session
    const session = await Session.findById(sessionId).session(sessionClient)
    if (!session || session.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Session not found!')
    }

    // Check if the session is deleted
    if (session.max_participants <= 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This session does not have any available seats!',
      )
    }

    // Find the slot details
    const slotData = await SessionSlots.findById(slot).session(sessionClient)
    if (!slotData || slotData?.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot not found!')
    }

    // Validate slot belongs to the session
    if (slotData.session.toString() !== sessionId.toString()) {
      throw new AppError(
        httpStatus.CONFLICT,
        'You selected an invalid slot. Please select a valid session slot!',
      )
    }

    //@ts-ignore
    payload.session = session._id
    payload.credit = session.credit
    payload.status = BOOKING_STATUS.confirmed

    // if payload credit is bigger then users credits then throw error
    if (userData.credits < payload.credit) {
      throw new AppError(
        httpStatus.CONFLICT,
        'You do not have enough credits. Please purchase more credits!',
      )
    }

    // Deduct credits (inside transaction)
    await User.findByIdAndUpdate(
      userData._id,
      { $inc: { credits: -payload.credit } },
      { new: true, session: sessionClient },
    )

    // Create the booking
    const result = await Booking.create([payload], { session: sessionClient })
    if (!result || result.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
    }

    // Commit the transaction if everything succeeds
    await sessionClient.commitTransaction()
    sessionClient.endSession()

    return result[0]
  } catch (error) {
    await sessionClient.abortTransaction()
    sessionClient.endSession()
    throw error
  }
}

const getAllBookings = async (query: Record<string, any>) => {
  const { searchTerm, page = '1', limit = '10' } = query

  // Ensure page and limit are integers
  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)

  if (isNaN(pageNum) || isNaN(limitNum)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid page or limit value!')
  }

  // Aggregation pipeline for booking data
  const aggregationPipeline: any[] = [
    {
      $lookup: {
        from: 'sessions',
        localField: 'session',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'trainers',
        localField: 'session.coach',
        foreignField: '_id',
        as: 'coach',
      },
    },
    { $unwind: { path: '$coach', preserveNullAndEmptyArrays: true } },
    // {
    //   $lookup: {
    //     from: 'users',
    //     localField: 'coach.user',
    //     foreignField: '_id',
    //     as: 'coachUser',
    //   },
    // },
    { $unwind: { path: '$coachUser', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'sessionslots',
        localField: 'slot',
        foreignField: '_id',
        as: 'slot',
      },
    },
    { $unwind: { path: '$slot', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        user: 1,
        createdAt: 1,
        updatedAt: 1,
        amount: 1,
        paymentStatus: 1,
        status: 1,
        'session._id': 1,
        'session.name': 1,
        'session.credit': 1,
        'session.duration': 1,
        'session.startDate': 1,
        'session.coach._id': '$coach._id',
        'session.coach.name': '$coach.name',
        'session.coach.photoUrl': '$coach.photoUrl',
        'slot._id': 1,
        'slot.startTime': 1,
        'slot.endTime': 1,
      },
    },
    // Search functionality for `searchTerm`
    ...(searchTerm
      ? [
          {
            $match: {
              $or: [
                { 'session.name': { $regex: searchTerm, $options: 'i' } },
                {
                  'session.coach.user.name': {
                    $regex: searchTerm,
                    $options: 'i',
                  },
                },
              ],
            },
          },
        ]
      : []),
    // Sort by created date (descending)
    { $sort: { createdAt: -1 } },
    // Pagination using `$skip` and `$limit`
    { $skip: (pageNum - 1) * limitNum },
    { $limit: limitNum },
  ]

  // Execute the aggregation pipeline
  const result = await Booking.aggregate(aggregationPipeline)

  // Total count for pagination meta
  const total = await Booking.countDocuments()
  const totalPage = Math.ceil(total / limitNum)

  return {
    data: result.length > 0 ? result : [],
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPage,
    },
  }
}

const getMyBookings = async (query: Record<string, any>) => {
  const sessionQuery = new QueryBuilder(
    Booking.find().populate([
        {
          path: 'session',
          populate: {
            path: 'coach',
          },
        },
        { path: 'user', select: 'name email photoUrl contactNumber age' },
        { path: 'slot' },
      ]),
      query,
    )
      .search([''])
      .filter()
      .sort()
      .paginate()
      .fields()
  
    const result = await sessionQuery.modelQuery
    const meta = await sessionQuery.countTotal()
    if (!sessionQuery) {
      throw new AppError(httpStatus.NOT_FOUND, 'Session not found!')
    }
  
    return {
      meta,
      result,
    }
}

const getBookingsById = async (id: string) => {
  const result = await Booking.findById(id).populate([
    {
      path: 'session',
      populate: {
        path: 'coach',
      },
    },
    { path: 'user', select: 'name email photoUrl contactNumber age' },
    { path: 'slot' },
  ])

  if (!result || result?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Bookings not found!')
  }

  return result
}

const updateBookings = async (id: string, payload: Partial<TBookings>) => {
  const result = await Booking.findByIdAndUpdate(id, payload, { new: true })
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Bookings')
  }

  return result
}

const cancelBooking = async (id: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const booking = await Booking.findById(id).session(session)
    if (!booking || booking.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
    }

    if (booking.status !== 'confirmed') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cancellation is only allowed for confirmed bookings status.',
      )
    }

    const sessionData = await Session.findById(booking.session)
    if (!sessionData || sessionData.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Session not found!')
    }

    // Fetch the session slot details
    const sessionSlot = await SessionSlots.findById(booking.slot).session(
      session,
    )
    if (!sessionSlot || sessionSlot.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Session slot not found!')
    }

    // Calculate time difference between booking creation and current time
    const hoursSinceBooking = moment().diff(moment(booking.createdAt), 'hours')

    if (hoursSinceBooking > 6) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cancellation is only allowed within 6 hours of booking.',
      )
    }

    // Update booking status to cancelled
    const result = await Booking.findByIdAndUpdate(
      id,
      { status: BOOKING_STATUS.cancelled },
      { new: true, session },
    )

    // get back credits when user cancel their session
    await User.findByIdAndUpdate(
      booking?.user,
      { $inc: { credits: booking?.credit } },
      { new: true, session },
    )

    if (!result) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to cancel booking')
    }

    // ✅ Increase max_participants by 1
    sessionData.max_participants += 1
    await sessionData.save({ session })

    // sent all waitlist users to notify
    await bookingsOnendNotifyToUsers('opened', result)

    // Send cancellation notification
    await sendBookingsNotification('cancellation', result)

    // Commit the transaction
    await session.commitTransaction()
    session.endSession()

    return result
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
}

const deleteBookings = async (id: string) => {
  const booking = await Booking.findById(id)
  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
  }

  const session = await Session.findById(booking.session)
  if (!session || session.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Session not found!')
  }

  const result = await Booking.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  )

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete bookings')
  }

  // Reduce max_participants by 1
  session.max_participants += 1
  await session.save()

  return result
}

const completeBooking = async (id: string) => {
  const isExist = await Booking.findById(id)
  if (!isExist) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
  }

  const result = await Booking.findByIdAndUpdate(
    id,
    { status: BOOKING_STATUS.completed },
    { new: true },
  )
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to complete booking')
  }

  return result
}

const rescheduleBooking = async (id: string, payload: { slot: string }) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const booking = await Booking.findById(id).session(session)
    if (!booking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
    }

    if (booking.status !== 'confirmed') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Rescheduling is only allowed for confirmed bookings status.',
      )
    }

    const currentSlot = await SessionSlots.findById(booking?.slot).session(
      session,
    )
    if (!currentSlot) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Current session slot not found!',
      )
    }

    // Fetch new slot details
    const newSlot = await SessionSlots.findById(payload.slot).session(session)
    if (!newSlot) {
      throw new AppError(httpStatus.BAD_REQUEST, 'New session slot not found!')
    }

    // Update the booking with the new slot
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { slot: payload.slot, updatedAt: new Date() },
      { new: true },
    ).session(session)

    if (!updatedBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to reschedule booking')
    }

    // when reschedule booking then notify the user
    await sendBookingsNotification('reschedule', updatedBooking)

    // Commit the transaction
    await session.commitTransaction()
    session.endSession()

    return updatedBooking
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
}

export const bookingsService = {
  createBookings,
  getAllBookings,
  getMyBookings,
  getBookingsById,
  updateBookings,
  deleteBookings,
  cancelBooking,
  completeBooking,
  rescheduleBooking,
}
