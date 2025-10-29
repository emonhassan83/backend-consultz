import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { TUser } from '../user/user.interface'
import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import config from '../../config'

export type TExpiresIn =
  | number
  | '30s'
  | '1m'
  | '5m'
  | '10m'
  | '1h'
  | '1d'
  | '7d'
  | '30d'
  | '365d'

export const createToken = (
  jwtPayload: { _id: Types.ObjectId; email: string; role: string },
  secret: string,
  expiresIn: TExpiresIn,
) => {
  return jwt.sign(jwtPayload, secret, { expiresIn })
}

export const verifyToken = (token: string, secret: string) => {
  return jwt.verify(token, secret) as jwt.JwtPayload
}

export const generateTokens = (user: TUser) => {
  const jwtPayload = { _id: user._id, email: user.email, role: user.role }

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as TExpiresIn
  )

  const refreshToken = createToken(
    jwtPayload,
    config.jwt_refresh_secret as string,
    config.jwt_refresh_expires_in as TExpiresIn
  )

  return { user, accessToken, refreshToken }
}


export const authNotifyUser = async (
  action: 'PASSWORD_CHANGE' | 'PASSWORD_FORGET' | 'PASSWORD_RESET',
  user: TUser,
) => {
  // Determine the message and description based on the action
  let message
  let description

  switch (action) {
    case 'PASSWORD_CHANGE':
      message = messages.adminProfile.passwordChanged
      description = 'Admin has successfully changed their password !'
      break
    case 'PASSWORD_FORGET':
      message = messages.adminProfile.passwordForgot
      description =
        'A password reset request has been initiated for the admin account.'
      break
    case 'PASSWORD_RESET':
      message = messages.adminProfile.passwordReset
      description = 'Admin admin has successfully reset their password.'
      break
    default:
      throw new Error('Invalid action type')
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: user._id,
    model_type: modeType.User,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}
