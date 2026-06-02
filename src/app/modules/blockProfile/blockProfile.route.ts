import { Router } from 'express';
import { BlockProfileController } from './blockProfile.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constant';

const router = Router();

router.post(
  '/block/:blockedId',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  BlockProfileController.blockUserProfile,
);

router.post(
  '/unblock/:blockedId',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  BlockProfileController.unblockProfile,
);

router.get(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  BlockProfileController.getMyBlockProfile,
);

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert, USER_ROLE.admin),
  BlockProfileController.getBlockProfileById,
);

export const BlockProfileRoutes = router;
