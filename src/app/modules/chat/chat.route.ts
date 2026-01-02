import { Router } from 'express'
import { chatController } from './chat.controller'
import validateRequest from '../../middleware/validateRequest'
import { ChatValidation } from './chat.validation'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  validateRequest(ChatValidation.createValidation),
  chatController.createChat,
)

router.put(
  '/:id',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  validateRequest(ChatValidation.updateValidation),
  chatController.updateChat,
)

router.delete(
  '/:id',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.deleteChat,
)

router.get(
  '/project/:userId',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getChatByUserId,
)

router.get(
  '/my-chat-list',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getMyChatList,
)

router.get(
  '/:id',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getChatById,
)

export const ChatRoutes = router
