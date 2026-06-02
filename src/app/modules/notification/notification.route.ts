import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { NotificationControllers } from './notification.controller'
import { NotificationValidation } from './notification.validation'
import zodValidationRequest from '../../middleware/validateRequest'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.admin),
  zodValidationRequest(NotificationValidation.createValidationSchema),
  NotificationControllers.createNotification,
)

router.delete(
  '/my-notifications',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  NotificationControllers.deleteAllNotifications,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  NotificationControllers.deleteANotification,
)

router.patch(
  '/',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  NotificationControllers.markAsDoneNotification,
)

router.get(
  '/',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  NotificationControllers.getAllNotifications,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  NotificationControllers.getANotification,
)

export const NotificationRoutes = router
