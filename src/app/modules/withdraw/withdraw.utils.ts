import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import { TUser } from '../user/user.interface'
import { TWithdraw } from './withdraw.interface'
import { TWithdrawStatus } from './withdraw.constant'

export const sendWithdrawNotify = async (
  action: TWithdrawStatus,
  withdraw: TWithdraw,
  user: TUser
) => {
  if (!user?.fcmToken || !user.pushNotify.payment) return
  
  let message = ''
  let description = ''

  const formattedAmount = `${withdraw.amount.toFixed(2)}`

  switch (action) {
    case 'hold':
      message = messages.withdraw.hold || 'Withdrawal Request On Hold'
      description = `Your withdrawal request of ${formattedAmount} is currently on hold. We will review it soon and notify you.`
      break

    case 'proceed':
      message = messages.withdraw.proceed || 'Withdrawal Processing Started'
      description = `Your withdrawal of ${formattedAmount} has been approved and is now being processed. Funds will be transferred shortly.`
      break

    case 'completed':
      message = messages.withdraw.completed || 'Withdrawal Completed'
      description = `Your withdrawal of ${formattedAmount} has been successfully completed! Check your bank/stripe account.`
      break

    default:
      throw new Error('Invalid withdraw notification action')
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: withdraw._id as string,
    model_type: modeType.Withdraw,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}
