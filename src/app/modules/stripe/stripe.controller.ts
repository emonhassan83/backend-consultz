import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { stripeService } from './stripe.service'
import sendResponse from '../../utils/sendResponse'
import httpStatus from 'http-status'

// 🔥 Step 1: Mobile app checks if Stripe is connected
const checkStripeConnected = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.checkStripeConnected(req?.user?._id);
  
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.isConnected
      ? 'Stripe account is connected'
      : 'Stripe account not connected',
    data: result,
  });
});

// 🔥 Step 2: Mobile app requests onboarding link
const stripLinkAccount = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.stripLinkAccount(req?.user?._id);
  
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.alreadyConnected 
      ? 'Already connected' 
      : 'Onboarding URL generated',
    data: result,
  });
});

// 🔥 Step 3: Handle refresh (browser redirect)
const refresh = catchAsync(async (req: Request, res: Response) => {
  const url = await stripeService.refresh(req.params?.id, req.query);
  res.redirect(url);
});

// 🔥 Step 4: Handle return and redirect to mobile app
const returnUrl = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.returnUrl(req.query);
  res.redirect(result.url);
});

// 🔥 Step 5: Get Stripe account status
const getStripeAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.getStripeAccountStatus(req?.user?._id);
  
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Stripe account status retrieved',
    data: result,
  });
});

// 🔥 Step 6: Disconnect Stripe account
const disconnectStripe = catchAsync(async (req: Request, res: Response) => {
  const result = await stripeService.disconnectStripe(req?.user?._id);
  
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result,
  });
});

export const stripeController = {
  stripLinkAccount,
  checkStripeConnected,
  refresh,
  returnUrl,
  getStripeAccountStatus,
  disconnectStripe,
};
