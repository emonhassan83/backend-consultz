import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { WithdrawControllers } from './withdraw.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { WithdrawValidation } from './withdraw.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.consult),
  zodValidationRequest(WithdrawValidation.createValidationSchema),
  WithdrawControllers.addWithdraw,
)

router.patch(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(WithdrawValidation.updateValidationSchema),
  WithdrawControllers.updateWithdraw,
)

router.get('/', auth(USER_ROLE.admin), WithdrawControllers.getAllMyWithdraw)

router.get('/:id', auth(USER_ROLE.admin), WithdrawControllers.getAWithdraw)

export const WithdrawRoutes = router
