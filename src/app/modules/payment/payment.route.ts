import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { PaymentValidation } from './payment.validation'
import { PaymentControllers } from './payment.controller'

const router = express.Router()

// Logged-in only: the payer is always the token's user, never the body (Phase 0)
router.post(
  '/checkout',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(PaymentValidation.createValidationSchema),
  PaymentControllers.checkout,
)

router.post(
  '/confirm-payment',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(PaymentValidation.confirmPaymentSchema),
  PaymentControllers.confirmPayment,
)

router.get('/', auth(USER_ROLE.admin), PaymentControllers.getAllPayments)

router.get(
  '/dashboard-data',
  auth(USER_ROLE.admin),
  PaymentControllers.getDashboardData,
)

router.get('/booking/:bookingId', PaymentControllers.getAPaymentByBookingId)

router.post(
  '/:paymentId/refund',
  auth(USER_ROLE.admin),
  zodValidationRequest(PaymentValidation.refundValidationSchema),
  PaymentControllers.refundPayment,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  PaymentControllers.getAPayment,
)

export const PaymentRoutes = router
