import { Router } from 'express'
import { CallingController } from './calling.controller'
import { CallingValidation } from './calling.validation'
import zodValidationRequest from '../../middleware/validateRequest'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'

const router = Router()

router.post(
  '/start',
  auth(USER_ROLE.expert),
  zodValidationRequest(CallingValidation.startCallingValidation),
  CallingController.startCalling,
)

export const CallingRoutes = router
