import { getMessaging } from 'firebase-admin/messaging'
import { Types } from 'mongoose'
import { Notification } from '../modules/notification/notification.model'
import { modeType } from '../modules/notification/notification.interface'

/**
 * In-app notification that doesn't depend on FCM (#68, #70): the Notification
 * document is always saved (sendNotification only saves it when the push
 * succeeds), then a socket event, then a push if the user has a token.
 * Never throws.
 */
export const notifyUserInApp = async (params: {
  receiver: Types.ObjectId | string
  message: string
  description: string
  reference?: Types.ObjectId | string | null
  modelType: modeType
  fcmToken?: string | null
}) => {
  const { receiver, message, description, reference, modelType, fcmToken } = params
  try {
    const doc = await Notification.create({
      receiver,
      message,
      description,
      reference: reference ?? null,
      modelType,
    })

    // @ts-ignore
    const io = global?.socketio
    if (io) io.emit(`notification::${receiver}`, doc.toObject())

    if (fcmToken) {
      try {
        await getMessaging().send({
          token: fcmToken,
          notification: { title: message, body: description },
          // same iOS alert settings as sendNotification
          apns: {
            headers: { 'apns-push-type': 'alert' },
            payload: { aps: { badge: 1, sound: 'default' } },
          },
        })
      } catch (err) {
        console.error('[notifyUserInApp] push failed', String(receiver), err)
      }
    }
    return doc
  } catch (err) {
    console.error('[notifyUserInApp] failed', String(receiver), err)
    return null
  }
}
