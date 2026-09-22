import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { WithdrawControllers } from './withdraw.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { WithdrawValidation } from './withdraw.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.expert),
  zodValidationRequest(WithdrawValidation.createValidationSchema),
  WithdrawControllers.addWithdraw,
)

router.patch(
  '/:withdrawId/manual-hold',
  auth(USER_ROLE.admin),
  zodValidationRequest(WithdrawValidation.manualHoldReleaseValidationSchema),
  WithdrawControllers.manualHoldWithdraw,
)

router.patch(
  '/:withdrawId/manual-release',
  auth(USER_ROLE.admin),
  zodValidationRequest(WithdrawValidation.manualHoldReleaseValidationSchema),
  WithdrawControllers.manualReleaseWithdraw,
)

router.get(
  '/my-withdraws',
  auth(USER_ROLE.expert),
  WithdrawControllers.getConsultWithdraw,
)

router.get('/', auth(USER_ROLE.admin), WithdrawControllers.getAllWithdraw)

router.get('/:id', auth(USER_ROLE.admin), WithdrawControllers.getAWithdraw)

export const WithdrawRoutes = router
