import { modeType } from '../notification/notification.interface'
import { messages } from '../notification/notification.constant'
import { NotificationService } from '../notification/notification.service'
import { Types } from 'mongoose'

type TCommentNotificationPayload = {
  postId: Types.ObjectId
  commentBy: {
    _id: Types.ObjectId
    name: string
  }
  authorId: Types.ObjectId
}

export const sendCommentNotificationToAuthor = async (
  payload: TCommentNotificationPayload,
) => {
  const { postId, commentBy, authorId} = payload

  // Determine the message from constants
  let message = messages.comment.add
  let description = `${commentBy.name} commented on your feed post.`

  // Send the notification
  await NotificationService.createNotificationIntoDB({
    receiver: authorId,
    reference: postId,
    message,
    description,
    modelType: modeType.Comment,
  })
}
