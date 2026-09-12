import { Router } from 'express'
import { bookingsController } from './booking.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { BookingsValidation } from './booking.validation'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'

const router = Router()

router.post(
  '/',
  zodValidationRequest(BookingsValidation.createValidationSchema),
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.createBookings,
)

router.patch(
  '/canceled/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.cancelBooking,
)

router.patch(
  '/completed/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(BookingsValidation.completedValidationSchema),
  bookingsController.completedBooking,
)

router.patch(
  '/confirmed/:id',
  auth(USER_ROLE.expert),
  bookingsController.confirmedBooking,
)

router.patch(
  '/declined/:id',
  auth(USER_ROLE.expert),
  zodValidationRequest(BookingsValidation.declineValidationSchema),
  bookingsController.declineBooking,
)

router.patch(
  '/reschedule/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(BookingsValidation.rescheduleValidationSchema),
  bookingsController.rescheduleBooking,
)

router.patch(
  '/request-schedule-change/:id',
  auth(USER_ROLE.expert),
  zodValidationRequest(BookingsValidation.requestScheduleChangeValidationSchema),
  bookingsController.requestScheduleChange,
)

router.delete(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.deleteBookings,
)

router.get(
  '/booking-calender',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.getBookingCalender,
)

router.get(
  '/consult/bookings_by_date',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.getConsultBookingsByDate,
)

router.get(
  '/consult/my-bookings',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.getMyBookings,
)

router.get(
  '/expert/bookings_by_date',
  auth(USER_ROLE.expert),
  bookingsController.getExpertBookingsByDate,
)

router.get(
  '/expert/my-bookings',
  auth(USER_ROLE.expert),
  bookingsController.getConsultBookings,
)

router.get(
  '/expert/:expertId',
  auth(USER_ROLE.admin),
  bookingsController.getExpertBooking,
)

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  bookingsController.getBookingsById,
)

router.get('/', auth(USER_ROLE.admin), bookingsController.getAllBookings)

export const BookingsRoutes = router
