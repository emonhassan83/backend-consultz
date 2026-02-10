import { Router } from 'express'
import auth from '../../middleware/auth'
import { stripeController } from './stripe.controller'
import { USER_ROLE } from '../user/user.constant'

const router = Router()

router.post(
  '/connect',
  auth(USER_ROLE.expert),
  stripeController.stripLinkAccount,
)

router.get(
  '/check-connection',
  auth(USER_ROLE.expert),
  stripeController.checkStripeConnected,
)

router.get('/oauth/callback', stripeController?.handleStripeOAuth)
router.get('/return', stripeController.returnUrl)
router.get('/refresh/:id', stripeController.refresh)

export const StripeRoute = router
