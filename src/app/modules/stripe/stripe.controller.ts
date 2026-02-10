import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { stripeService } from './stripe.service'
import sendResponse from '../../utils/sendResponse'
import httpStatus from 'http-status'
import config from '../../config'

const stripLinkAccount = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.stripLinkAccount(req?.user?._id)
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    data: result,
    message: 'Account creation URL generated successfully.',
  })
})

// checked stripe connected
const checkStripeConnected = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.checkStripeConnected(req?.user?.userId)
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
  const result = await stripeService.refresh(req.params?.id, req.query)

  // Remove sendResponse after res.redirect to avoid setting headers twice
  res.redirect(result)
})

const returnUrl = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.returnUrl(req.query);
  res.redirect(result.url);
});

export const stripeController = {
  stripLinkAccount,
  checkStripeConnected,
  handleStripeOAuth,
  refresh,
  returnUrl,
}
