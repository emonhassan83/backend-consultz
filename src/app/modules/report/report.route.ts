import { Router } from 'express'
import { ReportController } from './report.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import validateRequest from '../../middleware/validateRequest'
import { ReportValidation } from './report.validation'

const router = Router()

router.post(
  '/',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  validateRequest(ReportValidation.createValidationSchema),
  ReportController.createReport,
)

router.get(
  '/my-feed-reports',
  auth(USER_ROLE.expert),
  ReportController.getMyFeedReports,
)

router.delete(
  '/feed/:feedId',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  ReportController.deleteReportByFeedId,
)

router.delete(
  '/:id',
  auth(USER_ROLE.consult, USER_ROLE.expert),
  ReportController.deleteReport,
)

router.get('/', auth(USER_ROLE.admin), ReportController.getAllReport)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  ReportController.getReportById,
)

export const ReportRoutes = router
