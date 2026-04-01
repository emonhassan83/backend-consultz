import config from '../../config'
import httpStatus from 'http-status'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import StripeService from '../../class/stripe/stripe'
import { sendNotification } from '../../utils/sentNotification'
import mongoose from 'mongoose'

// Create Stripe Express account and return onboarding link
const stripLinkAccount = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  // Check if already connected
  if (user.stripeAccountId) {
    return {
      alreadyConnected: true,
      message: 'Stripe account already connected',
      stripeAccountId: user.stripeAccountId,
    }
  }

  try {
    // Create Stripe Express account
    const account = await StripeService.getStripe().accounts.create({
      type: 'express',
      country: 'US',
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        userId: user._id.toString(),
      },
    })

    const accountId = account.id

    // 🎯 Deep link URLs for mobile app
    const refresh_url = `${config.server_url}/stripe/refresh/${accountId}?userId=${user._id}`

    // ✅ This URL will redirect to mobile app using deep link
    const return_url = `${config.server_url}/stripe/return?userId=${user._id}&stripeAccountId=${accountId}`

    // Create Stripe onboarding link
    const accountLink = await StripeService.connectAccount(
      return_url,
      refresh_url,
      accountId,
    )

    return {
      onboardingUrl: accountLink.url,
      accountId: accountId,
      message: 'Open this URL in browser to complete Stripe onboarding',
    }
  } catch (error: any) {
    if (error.code === 'platform_profile_incomplete') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Stripe platform profile incomplete. Contact support.',
      )
    }
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      error.message || 'Failed to create Stripe account',
    )
  }
}

// Check if user has connected Stripe account
const checkStripeConnected = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  return {
    isConnected: !!user.stripeAccountId,
    stripeAccountId: user.stripeAccountId || null,
  }
}

// Handle Stripe OAuth callback and save connected account ID
const handleStripeOAuth = async (
  query: Record<string, any>,
  userId: string,
) => {
  const { code } = query

  if (!code) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No authorization code received from Stripe',
    )
  }

  try {
    const response = await StripeService.getStripe().oauth.token({
      grant_type: 'authorization_code',
      code: code as string,
    })

    const connectedAccountId = response.stripe_user_id

    if (!connectedAccountId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No stripe_user_id received')
    }

    await User.findByIdAndUpdate(userId, {
      stripeAccountId: connectedAccountId,
    })

    return { success: true, stripeAccountId: connectedAccountId }
  } catch (error: any) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error.message || 'Failed to connect Stripe account',
    )
  }
}

// Generate refresh link for stuck onboarding
const refresh = async (accountId: string, query: Record<string, any>) => {
  const userId = query.userId as string

  const user = await User.findById(userId)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  const refresh_url = `${config.server_url}/stripe/refresh/${accountId}?userId=${userId}`
  const return_url = `${config.server_url}/stripe/return?userId=${userId}&stripeAccountId=${accountId}`

  const accountLink = await StripeService.connectAccount(
    return_url,
    refresh_url,
    accountId,
  )

  return accountLink.url
}

const returnUrl = async (query: Record<string, any>) => {
  const userId = query.userId as string
  const stripeAccountId = query.stripeAccountId as string

  if (!userId || !stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Missing userId or stripeAccountId',
    )
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const user = await User.findById(userId).session(session)
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found')
    }

    // Check if this is the FIRST time connecting Stripe
    const isFirstTimeConnect = !user.stripeAccountId

    // Verify Stripe account is active
    const account =
      await StripeService.getStripe().accounts.retrieve(stripeAccountId)

    if (!account.charges_enabled || !account.payouts_enabled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Stripe account onboarding not completed. Please complete all required steps.',
      )
    }

    // Update user's Stripe account ID
    user.stripeAccountId = stripeAccountId

    // 🎁 Award 200 points on first connection
    if (isFirstTimeConnect) {
      user.points = (user.points || 0) + 200

      // Send push notification
      if (user.fcmToken && user.pushNotify?.payment) {
        await sendNotification([user.fcmToken], {
          message: 'Payment Method Connected! 🎉',
          description:
            'You earned 200 points for connecting your Stripe account. You can now receive payments!',
        })
      }
    }

    await user.save({ session })
    await session.commitTransaction()

    // 🔥 Mobile App Deep Link Redirect
    // Format: yourapp://stripe/success?status=connected&points=200
    const deepLink = `${config.app_url}://stripe/success?status=connected&points=${isFirstTimeConnect ? 200 : 0}&accountId=${stripeAccountId}`

    return {
      url: deepLink,
      isFirstTime: isFirstTimeConnect,
      pointsEarned: isFirstTimeConnect ? 200 : 0,
    }
  } catch (error) {
    await session.abortTransaction()
    console.error('Stripe return URL failed:', error)

    // Redirect to error deep link
    const errorDeepLink = `${config.app_url}://stripe/error?message=${encodeURIComponent(error instanceof Error ? error.message : 'Connection failed')}`

    return { url: errorDeepLink }
  } finally {
    session.endSession()
  }
}

// 🔥 Step 5: Get Stripe account status (for dashboard)
const getStripeAccountStatus = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  if (!user.stripeAccountId) {
    return {
      connected: false,
      message: 'Stripe account not connected',
    }
  }

  try {
    const account = await StripeService.getStripe().accounts.retrieve(
      user.stripeAccountId,
    )

    return {
      connected: true,
      accountId: user.stripeAccountId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      country: account.country,
      email: account.email,
      requirements: account.requirements?.currently_due || [],
    }
  } catch (error: any) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error.message || 'Failed to fetch Stripe account status',
    )
  }
}

// 🔥 Step 6: Disconnect Stripe account (optional)
const disconnectStripe = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  if (!user.stripeAccountId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No Stripe account connected')
  }

  // Note: Stripe doesn't allow programmatic account deletion
  // await StripeService.getStripe().accounts.del(user.stripeAccountId);

  // @ts-ignore
  user.stripeAccountId = null
  await user.save()

  return {
    success: true,
    message: 'Stripe account disconnected successfully',
  }
}

export const stripeService = {
  stripLinkAccount,
  checkStripeConnected,
  handleStripeOAuth,
  refresh,
  returnUrl,
  getStripeAccountStatus,
  disconnectStripe,
}
