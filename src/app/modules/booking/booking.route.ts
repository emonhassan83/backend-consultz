import { Router } from 'express'
import { bookingsController } from './booking.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { BookingsValidation } from './booking.validation'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../User/user.constant'

const router = Router()

router.post(
  '/',
  zodValidationRequest(BookingsValidation.createValidationSchema),
  auth(USER_ROLE.user),
  bookingsController.createBookings,
)

router.patch(
  '/complete/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  bookingsController.completeBooking,
)

router.patch(
  '/canceled/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  bookingsController.cancelBooking,
)

router.patch(
  '/reschedule/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  bookingsController.rescheduleBooking,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  zodValidationRequest(BookingsValidation.updateValidationSchema),
  bookingsController.updateBookings,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  bookingsController.deleteBookings,
)

router.get(
  '/my-bookings',
  auth(USER_ROLE.user),
  bookingsController.getMyBookings,
)

router.get(
  '/reference/:referenceId',
  auth(USER_ROLE.admin, USER_ROLE.trainer, USER_ROLE.user),
  bookingsController.getAllBookingsWithReference,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.user),
  bookingsController.getBookingsById,
)

router.get('/', auth(USER_ROLE.admin), bookingsController.getAllBookings)

export const BookingsRoutes = router
