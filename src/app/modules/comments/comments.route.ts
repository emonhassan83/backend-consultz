import { Router } from 'express'
import { commentsController } from './comments.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import zodValidationRequest from '../../middleware/validateRequest'
import { CommentValidation } from './comments.validation'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(CommentValidation.createValidationSchema),
  commentsController.createComments,
)

router.put(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(CommentValidation.updateValidationSchema),
  commentsController.updateComments,
)

router.delete(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  commentsController.deleteComments,
)

router.get(
  '/content/:contentId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  commentsController.getAllCommentsByContent,
)

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  commentsController.getCommentsById,
)

router.get(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  commentsController.getAllComments,
)

export const CommentsRoutes = router
