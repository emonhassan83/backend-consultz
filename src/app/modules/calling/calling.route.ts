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

router.post(
  '/end',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(CallingValidation.endCallingValidation),
  CallingController.endCalling,
)

router.post(
  '/token',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(CallingValidation.callTokenZod),
  CallingController.generateToken,
)

router.get(
  '/my-calls',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  CallingController.getMyCalls,
)

export const CallingRoutes = router
