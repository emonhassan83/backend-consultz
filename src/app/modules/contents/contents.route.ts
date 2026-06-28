import { Router } from 'express'
import { contentsController } from './contents.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import zodValidationRequest from '../../middleware/validateRequest'
import { ContentValidation } from './contents.validation'

const router = Router()

// Update multiple general contents
router.put(
  '/generals',
  auth(USER_ROLE.admin),
  zodValidationRequest(ContentValidation.updateGeneralsZodSchema),
  contentsController.updateGeneralContents,
)

// Create or update single content
router.put(
  '/:key',
  auth(USER_ROLE.admin),
  zodValidationRequest(ContentValidation.createOrUpdateSettingZodSchema),
  contentsController.createOrUpdateContent,
)

// Get single content by key
router.get('/', contentsController.getContent)

// Get all general contents
router.get('/', contentsController.getGeneralContents)

export const contentsRoutes = router
