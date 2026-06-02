import { Router } from 'express';
import { CardController } from './card.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constant';
import validateRequest from '../../middleware/validateRequest';
import { CardValidation } from './card.validation';

const router = Router();

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  validateRequest(CardValidation.createValidationSchema),
  CardController.createCard,
);

router.patch(
  '/default/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.setAsDefault,
);

router.delete(
  '/:id',
 auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.deleteCard,
);

router.get(
  '/default',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.getDefaultCard,
);

router.get(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.getAllCard,
);

export const CardRoutes = router;
