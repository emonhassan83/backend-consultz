import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import validateRequest from '../../middleware/validateRequest'
import { AppealValidation } from './appeal.validation'
import { AppealController } from './appeal.controller'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.expert),
  validateRequest(AppealValidation.createAppealValidationSchema),
  AppealController.createAppeal,
)

router.get('/', auth(USER_ROLE.admin), AppealController.getAllAppeals)

router.patch(
  '/:id/decision',
  auth(USER_ROLE.admin),
  validateRequest(AppealValidation.decisionAppealValidationSchema),
  AppealController.decideAppeal,
)

export const AppealRoutes = router
