import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { stripeService } from './stripe.service'
import sendResponse from '../../utils/sendResponse'
import httpStatus from 'http-status'
import StripeService from '../../class/stripe/stripe'
import config from '../../config'

const stripLinkAccount = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.stripLinkAccount(req?.user?._id)
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Account creation URL generated successfully.',
    data: result,
  })
})

// Connect Existing Account
const connectExistingStripeAccount = catchAsync(async (req: Request, res: Response) => {
  const result = await StripeService.connectExistingAccount(req.user._id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result,
  });
});

// checked stripe connected
const checkStripeConnected = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.checkStripeConnected(req?.user?._id)
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result
      ? 'Stripe account is connected.'
      : 'Stripe account is not connected.',
    data: result,
  })
})

const handleStripeOAuth = catchAsync(async (req: Request, res: Response) => {
  await stripeService.handleStripeOAuth(req.query, req.user?._id)

  // Redirect to home or a specific page after successful OAuth
  res.redirect('/')
})

const refresh = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.refresh(req.params?.id as string, req.query)

  // Remove sendResponse after res.redirect to avoid setting headers twice
  res.redirect(result)
})

const returnUrl = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.returnUrl(req.query)
  const connected = Boolean((result as { connected?: boolean })?.connected)
  const status = connected ? 'success' : 'failed'
  const statusCode = connected ? httpStatus.OK : httpStatus.BAD_REQUEST
  const stripeAccountId =
    (result as { stripeAccountId?: string | null })?.stripeAccountId || ''

  const clientBase = String(config.client_url || '/').replace(/\/$/, '')
  const redirectUrl = new URL(`${clientBase}/`)
  redirectUrl.searchParams.set('status', status)
  redirectUrl.searchParams.set('statusCode', String(statusCode))
  redirectUrl.searchParams.set('success', String(connected))
  if (stripeAccountId) {
    redirectUrl.searchParams.set('stripeAccountId', stripeAccountId)
  }

  res.redirect(redirectUrl.toString())
})

// 🔥 Step 5: Get Stripe account status
const getStripeAccountStatus = catchAsync(
  async (req: Request, res: Response) => {
    const result = await stripeService.getStripeAccountStatus(req?.user?._id)

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: 'Stripe account status retrieved',
      data: result,
    })
  },
)

// 🔥 Step 6: Disconnect Stripe account
const disconnectStripe = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.disconnectStripe(req?.user?._id)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result,
  })
})

export const stripeController = {
  stripLinkAccount,
  connectExistingStripeAccount,
  checkStripeConnected,
  handleStripeOAuth,
  refresh,
  returnUrl,
  getStripeAccountStatus,
  disconnectStripe,
}
