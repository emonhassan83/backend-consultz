import { Router } from 'express'
import { reviewsController } from './review.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import zodValidationRequest from '../../middleware/validateRequest'
import { ReviewsValidation } from './review.validation'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(ReviewsValidation.createValidationSchema),
  reviewsController.createReviews,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(ReviewsValidation.updateValidationSchema),
  reviewsController.updateReviews,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  reviewsController.deleteReviews,
)

router.get(
  '/expert/:expertId',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  reviewsController.getReviewsByExpert,
)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  reviewsController.getReviewsById,
)

export const ReviewsRoutes = router
