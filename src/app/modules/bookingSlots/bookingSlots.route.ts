import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { BookingSlotsControllers } from './bookingSlots.controller'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  BookingSlotsControllers.createBookingSlot,
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
