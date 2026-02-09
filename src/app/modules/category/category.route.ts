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

router.get(
  '/',
  auth(USER_ROLE.admin),
  CategoryControllers.getAllCategory,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(CategoryValidation.createValidationSchema),
  CategoryControllers.updateACategory,
)

export const CategoriesRoutes = router
