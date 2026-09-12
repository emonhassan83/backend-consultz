import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { SettingsLogsControllers } from './settingsLogs.controller'

const router = express.Router()

router.get(
  '/',
  auth(USER_ROLE.admin),
  SettingsLogsControllers.getSettingsLogs,
)

export const SettingsLogsRoutes = router
