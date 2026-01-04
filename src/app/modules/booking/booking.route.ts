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
  auth(USER_ROLE.consult),
  bookingsController.createBookings,
)

router.patch(
  '/status/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.changeBookingStatus,
)

router.patch(
  '/reschedule/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.rescheduleBooking,
)

router.delete(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  bookingsController.deleteBookings,
)

router.get(
  '/consult/my-bookings',
  auth(USER_ROLE.consult),
  bookingsController.getMyBookings,
)

router.get(
  '/expert/my-bookings',
  auth(USER_ROLE.expert),
  bookingsController.getConsultBookings,
)

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  bookingsController.getBookingsById,
)

router.get('/', auth(USER_ROLE.admin), bookingsController.getAllBookings)

export const BookingsRoutes = router
