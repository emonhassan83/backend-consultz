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
  '/user/:userId',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getChatByUserId,
)

router.get(
  '/booking/:bookingId',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getChatBookingById,
)

router.get(
  '/my-chat-list',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  chatController.getMyChatList,
)

export const ChatRoutes = router
