import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { SubCategoryControllers } from './subcategory.controller'
import zodValidationRequest from '../../middleware/validateRequest'
import { SubCategoryValidation } from './subcategory.validation'

const router = express.Router()

router.post(
  '/',
  auth(USER_ROLE.admin),
  zodValidationRequest(SubCategoryValidation.createSubCategoryValidation),
  SubCategoryControllers.insertIntoDB,
)

router.get(
  '/:categoryId',
  auth(USER_ROLE.admin, USER_ROLE.expert),
  SubCategoryControllers.getAllSubCategory,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.expert),
  SubCategoryControllers.getACategory,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(SubCategoryValidation.updateSubCategoryValidation),
  SubCategoryControllers.updateACategory,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(SubCategoryValidation.updateSubCategoryValidation),
  SubCategoryControllers.updateACategory,
)

export const SubCategoriesRoutes = router
