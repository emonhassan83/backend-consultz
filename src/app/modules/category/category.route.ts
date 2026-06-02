import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { CategoryControllers } from './category.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { CategoryValidation } from './category.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.admin),
  zodValidationRequest(CategoryValidation.createValidationSchema),
  CategoryControllers.insertIntoDB,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(CategoryValidation.updateValidationSchema),
  CategoryControllers.updateACategory,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin),
  CategoryControllers.deleteACategory,
)

router.get('/', CategoryControllers.getAllCategory)
router.get('/:id', CategoryControllers.getACategory)

export const CategoriesRoutes = router
