import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { BookingSlotsControllers } from './bookingSlots.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { BookingSlotsValidation } from './bookingSlots.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  BookingSlotsControllers.createBookingSlot,
)

router.get(
  '/dynamic',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(BookingSlotsValidation.dynamicSlotsValidationSchema),
  BookingSlotsControllers.getDynamicBookingSlots,
)

router.get(
  '/expert/:userId',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  BookingSlotsControllers.getAllBookingSlots,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  BookingSlotsControllers.getABookingSlots,
)

export const BookingSlotsRoutes = router
