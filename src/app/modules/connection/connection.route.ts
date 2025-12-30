import { Router } from 'express';
import { FollowController } from './connection.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constant';

const router = Router();

router.post(
  '/follow/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  FollowController.followUser,
);

router.post(
  '/unfollow/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  FollowController.unfollowUser,
);

// router.get(
//   '/follower/:id',
//   auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
//   FollowController.checkedFollowUser,
// );

router.get(
  '/following/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  FollowController.getAllFollowing,
);

router.get(
  '/my-following',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  FollowController.getMyFollowing,
);

router.get(
  '/my-followers',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  FollowController.getMyFollowers,
);

export const ConnectionRoutes = router;
