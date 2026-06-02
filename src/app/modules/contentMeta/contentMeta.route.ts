import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import auth from '../../middleware/auth'
import { ContentMetaControllers } from './contentMeta.controller'
import { ContentMetaValidation } from './contentMeta.validation'
import { USER_ROLE } from '../user/user.constant'

const router = express.Router()

router.patch(
  '/like/:contentId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  ContentMetaControllers.likeContent,
)

router.patch(
  '/unlike/:contentId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  ContentMetaControllers.unlikeContent,
)

router.get(
  '/:contentId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  ContentMetaControllers.getAContentMeta,
)

export const ContentMetaRoutes = router
