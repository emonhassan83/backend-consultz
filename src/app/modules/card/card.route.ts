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

router.put(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  validateRequest(CardValidation.updateValidationSchema),
  CardController.updateCard,
);

router.delete(
  '/:id',
 auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.deleteCard,
);

router.get(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.getAllCard,
);

router.get(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  CardController.getCardById,
);

export const CardRoutes = router;
