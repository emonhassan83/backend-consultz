import { Router } from 'express'
import { contentsController } from './contents.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import zodValidationRequest from '../../middleware/validateRequest'
import { contentsValidation } from './contents.validation'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.admin),
  zodValidationRequest(contentsValidation.createValidationSchema),
  contentsController.createContents,
)

router.put(
  '/',
  auth(USER_ROLE.admin),
  zodValidationRequest(contentsValidation.updateValidationSchema),
  contentsController.updateContents,
)

router.get('/:id', contentsController.getContentsById)

router.get('/', contentsController.getAllContents)

router.delete('/:id', contentsController.deleteContents)

export const contentsRoutes = router
