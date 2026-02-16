import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TBookingSlots } from './bookingSlots.interface'
import { BookingSlots } from './bookingSlots.model'
import { User } from '../user/user.model'
import dayjs from 'dayjs'
import { DAY_MAP, generateHourlySlots } from './bookingSlots.utils'

const insertIntoDB = async (
  payload: { author: string },
  query: { year?: string; month?: string }
) => {
  const { author } = payload;
  const year = Number(query.year);
  const month = Number(query.month);

  if (!year || !month || isNaN(year) || isNaN(month)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Valid year and month are required');
  }

  const expert = await User.findById(author).lean();
  if (!expert || expert.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Expert not found!');
  }

  if (!expert.availability?.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Expert availability not set');
  }

  // Check if slots already exist for this month
  const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
  const existingSlots = await BookingSlots.find({
    author,
    date: { $regex: `^${monthPrefix}` },
  })
    .select('date time isBooked')
    .lean();

  if (existingSlots.length > 0) {
    return {
      message: 'Booking slots already exist for this month',
      data: existingSlots,
      count: existingSlots.length,
    };
  }

  // Generate slots from grouped availability
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth();
  const slotsToInsert: any[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = dayjs(`${year}-${month}-${d}`);
    const weekDay = date.format('ddd').toLowerCase(); // "mon", "tue", etc.

    // Find matching day object
    const dayAvailability = expert.availability.find((a: any) => a.day === weekDay);

    if (dayAvailability && dayAvailability.slots?.length > 0) {
      dayAvailability.slots.forEach((slot: any) => {
        const hourlySlots = generateHourlySlots(slot.from, slot.to); // your function

        hourlySlots.forEach((time: string) => {
          slotsToInsert.push({
            author,
            date: date.format('YYYY-MM-DD'),
            time,
            isBooked: false,
          });
        });
      });
    }
  }

  if (!slotsToInsert.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No slots generated from availability for this month'
    );
  }

  const insertedSlots = await BookingSlots.insertMany(slotsToInsert, {
    ordered: false,
  });

  return {
    message: 'Booking slots created successfully',
    data: insertedSlots,
    count: insertedSlots.length,
  };
};

const getAllIntoFromDB = async (query: Record<string, unknown>) => {
  const { year, month, author } = query as {
    year?: string
    month?: string
    author?: string
  }

  if (!year || !month) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Year and month are required')
  }

  if (!author) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Author is required')
  }

  const monthPrefix = `${year}-${month.padStart(2, '0')}`

  const result = await BookingSlots.find({
    author,
    date: { $regex: `^${monthPrefix}` },
  })
    .sort({ date: 1, time: 1 })
    .select('date time isBooked')

  return result
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
