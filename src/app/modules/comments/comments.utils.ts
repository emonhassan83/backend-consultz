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
  modelType: any
}

export const sendCommentNotificationToAuthor = async (
  payload: TCommentNotificationPayload,
) => {
  const { postId, commentBy, authorId, modelType } = payload

  // Determine the message from constants
  let message = ''
  let description = ''

  if (modelType === modeType.Feed) {
    message = messages.feedManagement.addComment
    description = `${commentBy.name} commented on your feed post.`
  } else if (modelType === modeType.Forum) {
    message = messages.forumManagement.addComment
    description = `${commentBy.name} replied to your forum post.`
  } else {
    throw new Error('Invalid model type for comment notification.')
  }

  // Send the notification
  await NotificationService.createNotificationIntoDB({
    receiver: authorId,
    reference: postId,
    message,
    description,
    model_type: modelType,
  })
}
