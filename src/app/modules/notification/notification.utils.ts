import { USER_ROLE } from '../user/user.constant'
import { TUser } from '../user/user.interface'

export type TPushNotifyCategory =
  | 'bookingAndSchedule'
  | 'scheduleRemainder'
  | 'payment'
  | 'points'
  | 'followers'
  | 'post'
  | 'reviews'

export type TEmailNotifyCategory = 'booking' | 'schedule' | 'payment'

export const canSendPushNotification = (
  user: TUser,
  category: TPushNotifyCategory,
): boolean => {
  // ❌ No token → no notify
  if (!user || !user?.fcmToken) return false

  // 🔹 Admin → always allowed
  if (user.role === USER_ROLE.admin) return true

  // 🔹 User notification settings
  const settings = user.pushNotify

  // Category specific check
  return Boolean(settings?.[category])
}

export const canSendEmailNotification = (
  user: TUser,
  category: TEmailNotifyCategory,
): boolean => {
  // ❌ No token → no notify
  if (!user) return false

  // 🔹 Admin → always allowed
  if (user.role === USER_ROLE.admin) return true

  // 🔹 User notification settings
  const settings = user.emailNotify

  // Category specific check
  return Boolean(settings?.[category])
}
