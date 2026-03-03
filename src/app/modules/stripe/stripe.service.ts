import config from '../../config';
import httpStatus from 'http-status';
import { User } from '../user/user.model';
import AppError from '../../errors/AppError';
import StripeService from '../../class/stripe/stripe';
import { sendNotification } from '../../utils/sentNotification';
import mongoose from 'mongoose';

// Create Stripe Express account and return onboarding link
const stripLinkAccount = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  try {
    const account = await StripeService.getStripe().accounts.create({
      type: 'express',
      country: 'US',
      email: user.email, // Important: Add email
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const accountId = account.id;

    const refresh_url = `${config.server_url}/stripe/refresh/${accountId}?userId=${user._id}`;
    const return_url = `${config.server_url}/stripe/return?userId=${user._id}&stripeAccountId=${accountId}`;

    const accountLink = await StripeService.connectAccount(return_url, refresh_url, accountId);

    return accountLink.url;
  } catch (error: any) {
    if (error.code === 'platform_profile_incomplete') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Stripe platform profile incomplete. Please accept responsibilities in Stripe dashboard.',
      );
    }
    throw new AppError(httpStatus.BAD_GATEWAY, error.message || 'Failed to create Stripe account');
  }
};

// Check if user has connected Stripe account
const checkStripeConnected = async (userId: string): Promise<boolean> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  return !!user.stripeAccountId;
};

// Handle Stripe OAuth callback and save connected account ID
const handleStripeOAuth = async (query: Record<string, any>, userId: string) => {
  const { code } = query;

  if (!code) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No authorization code received from Stripe');
  }

  try {
    const response = await StripeService.getStripe().oauth.token({
      grant_type: 'authorization_code',
      code: code as string,
    });

    const connectedAccountId = response.stripe_user_id;

    if (!connectedAccountId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No stripe_user_id received');
    }

    await User.findByIdAndUpdate(userId, {
      stripeAccountId: connectedAccountId,
    });

    return { success: true, stripeAccountId: connectedAccountId };
  } catch (error: any) {
    throw new AppError(httpStatus.BAD_REQUEST, error.message || 'Failed to connect Stripe account');
  }
};

// Generate refresh link for stuck onboarding
const refresh = async (accountId: string, query: Record<string, any>) => {
  const userId = query.userId as string;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const refresh_url = `${config.server_url}/stripe/refresh/${accountId}?userId=${userId}`;
  const return_url = `${config.server_url}/stripe/return?userId=${userId}&stripeAccountId=${accountId}`;

  const accountLink = await StripeService.connectAccount(return_url, refresh_url, accountId);

  return accountLink.url;
};

const returnUrl = async (query: Record<string, any>) => {
  const userId = query.userId as string;
  const stripeAccountId = query.stripeAccountId as string;

  if (!userId || !stripeAccountId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing userId or stripeAccountId');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check if this is the FIRST time Stripe account is being linked
    const isFirstTimeConnect = !user.stripeAccountId;

    // Update Stripe account ID
    user.stripeAccountId = stripeAccountId;

    // Award 200 points ONLY on first successful connection
    const pointsToAdd = 200;
    if (isFirstTimeConnect) {
      user.points = (user.points || 0) + pointsToAdd;

      // 1. Send push notification (if enabled)
      if (user.fcmToken && user.pushNotify?.points) {
        await sendNotification([user.fcmToken], {
          message: 'Payment Method Added!',
          description: `Congratulations! You have earned 200 points for successfully adding your payment method via Stripe. 🎉`,
        });
      }
    }

    // Save all changes
    await user.save({ session });

    await session.commitTransaction();

    return { url: `${config.payment_success_url}/account?success=true` };
  } catch (error) {
    await session.abortTransaction();
    console.error('Stripe return URL failed:', error);
    throw error instanceof AppError ? error : new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to process Stripe return');
  } finally {
    session.endSession();
  }
};

export const stripeService = {
  stripLinkAccount,
  checkStripeConnected,
  handleStripeOAuth,
  refresh,
  returnUrl,
};