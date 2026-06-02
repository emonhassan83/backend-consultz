import { modeType } from '../notification/notification.interface'
import { messages } from '../notification/notification.constant'
import { NotificationService } from '../notification/notification.service'
import { Types } from 'mongoose'
import { Feed } from '../feed/feed.model';

/**
 * Checks if the current user can delete a comment.
 * Returns true if:
 *   - The comment belongs to the current user, OR
 *   - The comment is on a feed/post authored by the current user
 */
export const canDeleteComment = async (
  comment: any,           // comment document (lean or full)
  currentUserId: string
): Promise<boolean> => {
  const commentUserId = comment.user?.toString() || comment.user;
  
  // 1. Own comment → always deletable
  if (commentUserId === currentUserId) {
    return true;
  }

  // 2. Comment on own feed/post → deletable
  const feed = await Feed.findById(comment.content).select('author').lean();
  if (!feed) return false;

  return feed.author.toString() === currentUserId;
};

/**
 * Batch version: checks delete permission for multiple comments
 * Returns Map<commentId: string, isDeletable: boolean>
 */
export const canDeleteCommentsBatch = async (
  comments: any[],           // array of populated comment documents
  currentUserId: string
): Promise<Map<string, boolean>> => {
  if (comments.length === 0) return new Map();

  const commentIds = comments.map(c => c._id.toString());
  const feedIds = [...new Set(comments.map(c => c.content?.toString()).filter(Boolean))];

  // Fetch all relevant feeds in one query
  const feeds = await Feed.find({ _id: { $in: feedIds } })
    .select('author')
    .lean();

  const feedAuthorMap = new Map(feeds.map(f => [f._id.toString(), f.author.toString()]));

  const result = new Map<string, boolean>();

  for (const comment of comments) {
    const commentId = comment._id.toString();

    // Safely handle missing/null user
    let commentUserId: string | null = null;
    if (comment.user) {
      // If populated, use _id (Mongoose converts to ObjectId)
      commentUserId = comment.user._id?.toString() || comment.user.toString?.() || null;
    }

    const feedId = comment.content?.toString();
    const feedAuthorId = feedAuthorMap.get(feedId) || null;

    const isOwnComment = commentUserId === currentUserId;
    const isOwnFeed = feedAuthorId === currentUserId;

    result.set(commentId, isOwnComment || isOwnFeed);
  }

  return result;
};

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
