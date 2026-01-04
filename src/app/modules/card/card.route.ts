import { Router } from 'express';
import { ReportController } from './card.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constant';
import validateRequest from '../../middleware/validateRequest';
import { ReportValidation } from './card.validation';

const router = Router();

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  validateRequest(ReportValidation.createValidationSchema),
  ReportController.createReport,
);

router.put(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  validateRequest(ReportValidation.updateValidationSchema),
  ReportController.updateReport,
);

router.patch(
  '/:id',
  auth(USER_ROLE.admin),
  validateRequest(ReportValidation.changeStatusValidationSchema),
  ReportController.changeStatusReport,
);

router.delete(
  '/:id',
 auth(USER_ROLE.consult, USER_ROLE.expert),
  ReportController.deleteReport,
);

router.get('/my-report',auth(USER_ROLE.consult, USER_ROLE.expert), ReportController.getMyReport);

router.get(
  '/',
  auth(USER_ROLE.admin),
  ReportController.getAllReport,
);

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  ReportController.getReportById,
);

export const ReportRoutes = router;
