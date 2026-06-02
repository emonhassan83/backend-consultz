import { Router } from 'express'
import { FollowController } from './connection.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'

const router = Router()

router.post(
  '/follow/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.followUser,
)

router.post(
  '/unfollow/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.unfollowUser,
)

router.get(
  '/followers/:userId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.getUserFollowers,
)

router.get(
  '/followings/:userId',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.getUserFollowing,
)

router.get(
  '/my-followers',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.getMyFollowers,
)

router.get(
  '/my-followings',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  FollowController.getMyFollowing,
)

export const ConnectionRoutes = router
