import { Router } from 'express'
import { otpControllers } from './otp.controller'
import validateRequest from '../../middleware/validateRequest'
import { resentOtpValidations } from './otp.validation'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
const router = Router()

router.post(
  '/verify-with-email',
  validateRequest(resentOtpValidations.verifyOtpZodSchema),
  otpControllers.verifyWithEmail,
)

router.post(
  '/verify-with-phone',
  validateRequest(resentOtpValidations.verifyOtpZodSchema),
  otpControllers.verifyWithPhoneNumber,
)

router.post(
  '/send-otp-in-email',
  validateRequest(resentOtpValidations.resentOtpInEmail),
  otpControllers.sendOtpInEmail,
)

router.post(
  '/send-otp-in-phone',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  validateRequest(resentOtpValidations.resentOtpInPhone),
  otpControllers.sendOtpInPhone,
)

export const otpRoutes = router
