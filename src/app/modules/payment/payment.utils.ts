import Stripe from 'stripe'
import config from '../../config'
import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { TPayment } from './payment.interface'
import { findAdmin } from '../../utils/findAdmin'
import { sendNotification } from '../../utils/sentNotification'
import { Types } from 'mongoose'
import { TUser } from '../user/user.interface'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

interface TPayload {
  product: {
    amount: number
    name: string
    quantity: number
  }
  customer: {
    name: string
    email: string
  }
  paymentId: string | Types.ObjectId
}

const formatMoney = (amount: number) => `£${Number(amount || 0).toFixed(2)}`

export const createCheckoutSession = async (payload: TPayload) => {
  const paymentGatewayData = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: payload?.product?.name,
          },
          unit_amount: payload.product?.amount * 100,
        },
        quantity: payload.product?.quantity,
      },
    ],
    success_url: `${config.server_url}/payments/confirm-payment?sessionId={CHECKOUT_SESSION_ID}&paymentId=${payload?.paymentId}`,
    cancel_url: config?.payment_cancel_url,
    mode: 'payment',
    invoice_creation: {
      enabled: true,
    },
    payment_method_types: ['card'],
  })

  return paymentGatewayData
}

export const paymentNotifyToAdmin = async (
  type: 'SUCCESS' | 'REFUND',
  payment: TPayment,
  refund?: any,
) => {
  const admin = await findAdmin()

  if (!admin || !admin?.fcmToken) return

  const message =
    type === 'SUCCESS'
      ? messages.paymentManagement.paymentSuccess
      : messages.paymentManagement.paymentRefunded

  const description =
    type === 'SUCCESS'
      ? `A payment of ${formatMoney(payment.amount)} has been successfully received. Transaction ID: ${payment.transactionId}.`
      : `A refund of ${formatMoney(refund?.amount || payment.amount)} has been successfully processed. Reason: ${refund?.reason || 'Refund processed'}.`

  const notifyPayload = {
    receiver: admin?._id,
    message,
    description,
    reference: payment.booking,
    modelType: modeType.Payment,
  }

  await sendNotification([admin.fcmToken], notifyPayload)
}

export const paymentNotifyToUser = async (
  type: 'SUCCESS' | 'REFUND',
  payment: TPayment,
  user: TUser,
  refund?: any,
) => {
  if (!user || !user?.fcmToken || user.pushNotify?.payment === false) return

  const message =
    type === 'SUCCESS'
      ? messages.paymentManagement.paymentSuccess
      : messages.paymentManagement.paymentRefunded

  const description =
    type === 'SUCCESS'
      ? `Your payment of ${formatMoney(payment.amount)} has been successfully processed`
      : `A refund of ${formatMoney(refund?.amount || payment.amount)} has been issued to your account. Reason: ${refund?.reason || 'Refund processed'}`

  const notifyPayload = {
    receiver: payment?.account,
    message,
    description,
    reference: payment._id,
    modelType: modeType.Payment,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}
