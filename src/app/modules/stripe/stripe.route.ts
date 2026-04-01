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

// Disconnect Stripe
router.delete(
  '/disconnect',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  stripeController.disconnectStripe,
)

// Get account status
router.get(
  '/account-status',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  stripeController.getStripeAccountStatus,
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
