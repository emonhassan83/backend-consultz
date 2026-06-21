import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { SupportControllers } from './support.controller'
import { SupportValidation } from './support.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(SupportValidation.createValidationSchema),
  SupportControllers.createSupport,
)
router.post(
  '/feedback',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  SupportControllers.sentFeedbackEmail,
)

router.post(
  '/sent-message/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(SupportValidation.sentMessageValidationSchema),
  SupportControllers.sentSupportMessage,
)

router.delete('/:id', auth(USER_ROLE.admin), SupportControllers.deleteASupport)

router.get('/', auth(USER_ROLE.admin), SupportControllers.getAllSupports)

export const SupportRoutes = router
