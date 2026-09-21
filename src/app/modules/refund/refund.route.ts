import { Router } from 'express'
import auth from '../../middleware/auth'
import { USER_ROLE } from '../user/user.constant'
import { RefundController } from './refund.controller'

const router = Router()

router.get('/', auth(USER_ROLE.admin), RefundController.getAllRefunds)

export const RefundRoutes = router
