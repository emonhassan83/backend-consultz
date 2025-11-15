import { Router } from 'express'
import { ReplyController } from './reply.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import zodValidationRequest from '../../middleware/validateRequest'
import { ReplyValidation } from './reply.validation'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  zodValidationRequest(ReplyValidation.createValidationSchema),
  ReplyController.createReply,
)

router.patch(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
   zodValidationRequest(ReplyValidation.updateValidationSchema),
  ReplyController.updateReply,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  ReplyController.deleteReply,
)

router.get(
  '/content/:commentId',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  ReplyController.getAllReplyByComment,
)

export const ReplyRoutes = router
