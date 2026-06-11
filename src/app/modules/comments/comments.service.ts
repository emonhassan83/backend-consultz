import httpStatus from 'http-status'
import mongoose, { Types } from 'mongoose'
import QueryBuilder from '../../builder/QueryBuilder'
import { TComments } from './comments.interface'
import { Comments } from './comments.models'
import AppError from '../../errors/AppError'
import { ContentMeta } from '../contentMeta/contentMeta.model'
import { Feed } from '../feed/feed.model'
import { User } from '../user/user.model'
import { Reply } from '../reply/reply.models'
import { canDeleteComment, canDeleteCommentsBatch } from './comments.utils'

const createComments = async (payload: TComments, userId: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This profile is not found!')
  }

  const session = await Comments.startSession()
  session.startTransaction()

  try {
    const { content, isReply, replyRef, comment } = payload

    const feed = await Feed.findById(content)
    if (!feed || feed.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, `Feed not found!`)
    }
    // assign author
    payload.user = new Types.ObjectId(userId)

    let result

    if (!isReply) {
      // Create new main comment
      const commentDoc = await Comments.create(
        [
          {
            user: new Types.ObjectId(userId),
            content: new Types.ObjectId(content as any),
          },
        ],
        { session },
      )

      result = commentDoc?.[0]

      // Increment comment count
      await ContentMeta.findOneAndUpdate(
        { content },
        { $inc: { comment: 1 } },
        { returnDocument: 'after', session },
      )
    } else {
      if (!replyRef) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Parent comment reference is required for a reply',
        )
      }

      const replyRefId = replyRef instanceof Types.ObjectId
        ? replyRef
        : typeof replyRef === 'object' && '_id' in replyRef
        ? (replyRef as any)._id
        : replyRef

      const parentComment = await Comments.findById(replyRefId)
      if (!parentComment) {
        throw new AppError(httpStatus.NOT_FOUND, 'Parent comment not found!')
      }

      // Create reply
      const replyDoc = await Reply.create(
        [
          {
            user: new Types.ObjectId(userId),
            replyRef: new Types.ObjectId(replyRefId),
            comment,
          },
        ],
        { session },
      )

      const createdReply = replyDoc[0]

      // Push reply to comment's reply array
      await Comments.findByIdAndUpdate(
        replyRefId,
        {
          $addToSet: { reply: createdReply._id },
        },
        { session },
      )

      result = createdReply
    }

    await session.commitTransaction()
    session.endSession()

    return result
  } catch (error: any) {
    await session.abortTransaction()
    session.endSession()
    throw new AppError(httpStatus.BAD_REQUEST, error.message)
  }
}

const getAllComments = async (userId: string, query: Record<string, any>) => {
  const commentsModel = new QueryBuilder(
    Comments.find()
      .populate([
        { path: 'user', select: 'firstName lastName photoUrl' },
        {
          path: 'reply',
          select: 'user replyRef comment updatedAt',
          populate: { path: 'user', select: 'firstName lastName photoUrl' },
        },
      ])
      .select('user comment reply updatedAt content'), // 'content' for feed reference
    query,
  )
    .search(['comment']) // search on main comment text
    .filter()
    .paginate()
    .sort() // latest first
    .fields()

  const comments = await commentsModel.modelQuery
  const meta = await commentsModel.countTotal()

  if (!comments || comments.length === 0) {
    return { data: [], meta }
  }

  // 1. Batch check delete permission for MAIN comments
  const commentDeleteMap = await canDeleteCommentsBatch(comments, userId)

  // 2. Collect ALL replies from all comments (flatten)
  const allReplies = comments.flatMap((comment) =>
    comment.reply.map((reply: any) => ({
      ...reply.toObject(),
      parentCommentId: comment._id.toString(), // for reference
      parentFeedId: comment.content.toString(), // feed reference
    })),
  )

  // 3. Batch check delete permission for ALL replies
  const replyDeleteMap = await canDeleteCommentsBatch(allReplies, userId)

  // 4. Enrich main comments + their replies
  const enrichedComments = comments.map((comment) => {
    const commentObj = comment.toObject()

    // Add isDeletable for main comment
    // @ts-ignore
    commentObj.isDeletable =
      commentDeleteMap.get(comment._id.toString()) || false

    // Enrich replies
    commentObj.reply = comment.reply.map((reply: any) => ({
      ...reply.toObject(),
      isDeletable: replyDeleteMap.get(reply._id.toString()) || false,
    }))

    return commentObj
  })

  return {
    data: enrichedComments,
    meta,
  }
}

const getCommentsById = async (userId: string, commentId: string) => {
  const comment = await Comments.findById(commentId)
    .populate([
      { path: 'user', select: 'firstName lastName photoUrl' },
      {
        path: 'reply',
        select: 'user replyRef comment updatedAt',
        populate: { path: 'user', select: 'firstName lastName photoUrl' },
      },
    ])
    .select('user comment reply updatedAt content')
    .lean()

  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found!')
  }

  // Check delete permission for main comment
  const commentDeletable = await canDeleteComment(comment, userId)

  // Batch check for all replies
  const replyDeleteMap = await canDeleteCommentsBatch(
    Array.isArray(comment.reply) ? comment.reply : [],
    userId,
  )

  // Enrich replies
  const enrichedReplies = Array.isArray(comment.reply)
    ? comment.reply.map((reply: any) => ({
        ...reply,
        isDeletable: replyDeleteMap.get(reply._id.toString()) || false,
      }))
    : []

  return {
    ...comment,
    isDeletable: commentDeletable,
    reply: enrichedReplies,
  }
}

const updateComments = async (
  id: string,
  payload: Partial<TComments>,
  userId: string,
) => {
  const comment = await Comments.findById(id)
  if (comment?.user?.toString() !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Unauthorized to Update this comment',
    )
  }
  const result = await Comments.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
  }).populate([
    { path: 'user', select: 'firstName lastName photoUrl' },
    {
      path: 'reply',
      populate: { path: 'user', select: 'firstName lastName photoUrl' },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Comments')
  }
  return result
}

const deleteComments = async (id: string, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the comment and validate ownership
    const comment = await Comments.findById(id).session(session)
    if (!comment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Comment not found')
    }

    if (comment.user?.toString() !== userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Unauthorized to delete this comment',
      )
    }

    // 2. Find all replies under this comment
    const replies = await Reply.find({ replyRef: id }).session(session)
    const replyCount = replies.length

    // 3. Delete all replies (if any)
    if (replyCount > 0) {
      await Reply.deleteMany({ replyRef: id }).session(session)
    }

    // 4. Delete the main comment
    const deletedComment = await Comments.findByIdAndDelete(id).session(session)
    if (!deletedComment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete comment')
    }

    // 5. Decrement comment count in ContentMeta (1 for comment + replyCount for replies)
    const totalToDecrement = 1 + replyCount

    const contentMeta = await ContentMeta.findOneAndUpdate(
      { content: comment.content },
      { $inc: { comment: -totalToDecrement } },
      { returnDocument: 'after', session },
    )

    if (!contentMeta) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Content Meta not found, comment count not updated',
      )
    }

    await session.commitTransaction()

    return deletedComment
  } catch (error) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to delete comment and replies',
        )
  } finally {
    session.endSession()
  }
}

export const commentsService = {
  createComments,
  getAllComments,
  getCommentsById,
  updateComments,
  deleteComments,
}
