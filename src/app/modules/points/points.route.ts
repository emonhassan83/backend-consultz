import { Router } from 'express'
import auth from '../../middleware/auth'
import zodValidationRequest from '../../middleware/validateRequest'
import { USER_ROLE } from '../user/user.constant'
import { PointsControllers } from './points.controller'
import { PointsValidation } from './points.validation'

const router = Router()

router.get('/rules', auth(USER_ROLE.admin), PointsControllers.getAllRules)

router.get(
  '/rules/:key',
  auth(USER_ROLE.admin),
  PointsControllers.getRule,
)

router.put(
  '/rules/:key',
  auth(USER_ROLE.admin),
  zodValidationRequest(PointsValidation.updateRuleSchema),
  PointsControllers.updateRule,
)

router.patch(
  '/rules/:key/enabled',
  auth(USER_ROLE.admin),
  zodValidationRequest(PointsValidation.toggleEnabledSchema),
  PointsControllers.toggleEnabled,
)

router.get(
  '/users/:userId/summary',
  auth(USER_ROLE.admin),
  PointsControllers.getUserSummary,
)

router.post(
  '/attribution',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(PointsValidation.attributionSchema),
  PointsControllers.setAttribution,
)

export const PointsRoutes = router
