import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { PointsLogsControllers } from './pointsLogs.controller'

const router = express.Router()

router.get(
  '/user/:userId',
  auth(USER_ROLE.admin, USER_ROLE.consult, USER_ROLE.expert),
  PointsLogsControllers.getUserPointsLogs,
)

export const PointsLogsRoutes = router
