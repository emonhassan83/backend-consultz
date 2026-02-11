import express from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { MetaController } from './meta.controller'

const router = express.Router()

router.get('/', auth(USER_ROLE.admin), MetaController.fetchDashboardMetaData)

export const MetaRoutes = router
