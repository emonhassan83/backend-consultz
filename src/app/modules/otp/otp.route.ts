import { Router } from 'express';
import { otpControllers } from './otp.controller';
import validateRequest from '../../middleware/validateRequest';
import { resentOtpValidations } from './otp.validation';
const router = Router();

router.post(
  '/verify-with-email',
  validateRequest(resentOtpValidations.verifyOtpZodSchema),
  otpControllers.verifyWithEmail,
);

router.post(
  '/verify-with-email',
  validateRequest(resentOtpValidations.verifyOtpZodSchema),
  otpControllers.verifyWithEmail,
);

router.post(
  '/send-otp-in-email',
  validateRequest(resentOtpValidations.resentOtpInEmail),
  otpControllers.sendOtpInEmail,
);

router.post(
  '/send-otp-in-phone',
  validateRequest(resentOtpValidations.resentOtpInPhone),
  otpControllers.sendOtpInPhone,
);

export const otpRoutes = router;