import { findAdmin } from '../../utils/findAdmin'
import { sendNotification } from '../../utils/sentNotification'
import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { TUser } from '../user/user.interface'
import { TSupport } from './support.interface'

export const sendSupportNotifyToAdmin = async (support: TSupport) => {
  const admin = await findAdmin()
  if (!admin || !admin?.fcmToken) return

  let message = messages.support.newMessage
  let description = `User support message regarding ${support?.subject} has been received.`

  const notifyPayload = {
    receiver: admin._id,
    message,
    description,
    reference: support._id,
    model_type: modeType.User,
  }

  await sendNotification([admin.fcmToken], notifyPayload)
}

export const sendSupportNotifyToUser = async (
  support: TSupport,
  user: TUser,
) => {
  if (!user || !user?.fcmToken) return

  let message = messages.support.response
  let description = `Your support message regarding respond admin. Check your email for more details.`

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: support._id,
    model_type: modeType.User,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}
