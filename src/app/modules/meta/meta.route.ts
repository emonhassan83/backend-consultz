import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { MetaController } from './meta.controller'

const router = express.Router()

router.get('/dashboard', auth(USER_ROLE.admin), MetaController.fetchDashboardMetaData)
router.get('/analysis', auth(USER_ROLE.admin), MetaController.analysisReportingMetaData)

export const MetaRoutes = router
