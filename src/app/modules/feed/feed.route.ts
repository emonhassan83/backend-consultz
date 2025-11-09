import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import auth from '../../middleware/auth'
import { FeedControllers } from './feed.controller'
import { FeedValidation } from './feed.validation'
import multer, { memoryStorage } from 'multer'
import parseData from '../../middleware/parseData'
import { USER_ROLE } from '../user/user.constant'

const router = express.Router()
const storage = memoryStorage()
const upload = multer({ storage })

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  upload.fields([{ name: 'content', maxCount: 12 }]),
  parseData(),
  zodValidationRequest(FeedValidation.createValidationSchema),
  FeedControllers.createFeed,
)

router.put(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  upload.fields([{ name: 'content', maxCount: 12 }]),
  parseData(),
  zodValidationRequest(FeedValidation.updateValidationSchema),
  FeedControllers.updateFeed,
)

router.delete(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FeedControllers.deleteAFeed,
)

router.get(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FeedControllers.getAllFeeds,
)

router.get(
  '/user/:userId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FeedControllers.getAllFeedsByUserId,
)

router.get(
  '/my-feed',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FeedControllers.getAllMyFeed,
)

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FeedControllers.getAFeed,
)

export const FeedRoutes = router
