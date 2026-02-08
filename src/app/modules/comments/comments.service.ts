import httpStatus from 'http-status'
import { Types } from 'mongoose'
import QueryBuilder from '../../builder/QueryBuilder'
import { TComments } from './comments.interface'
import { Comments } from './comments.models'
import AppError from '../../errors/AppError'
import { ContentMeta } from '../contentMeta/contentMeta.model'
import { Feed } from '../feed/feed.model'
import { User } from '../user/user.model'
import { Reply } from '../reply/reply.models'

const createComments = async (payload: TComments, userId: string) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This profile is not found!');
  }

  const session = await Comments.startSession();
  session.startTransaction();

  try {
    const { content, isReply, replyRef, comment } = payload;

    const feed = await Feed.findById(content);
    if (!feed || feed.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, `Feed not found!`);
    }
    // assign author
    payload.user = new Types.ObjectId(userId);

    let result;

    if (!isReply) {
      // Create new main comment
      const commentDoc = await Comments.create(
        [{ user: userId,content, comment }],
        { session }
      );

      result = commentDoc?.[0];

      // Increment comment count
      await ContentMeta.findOneAndUpdate(
        { content },
        { $inc: { comment: 1 } },
        { new: true, session }
      );
    } else {
      // Validate parent comment
      const parentComment = await Comments.findById(replyRef);
      if (!parentComment) {
        throw new AppError(httpStatus.NOT_FOUND, 'Parent comment not found!');
      }

      // Create reply
      const replyDoc = await Reply.create(
        [
          {
            user: userId,
            replyRef,
            comment,
          },
        ],
        { session }
      );

      const createdReply = replyDoc[0];

      // Push reply to comment's reply array
      await Comments.findByIdAndUpdate(
        replyRef,
        {
          $addToSet: { reply: createdReply._id },
        },
        { session }
      );

      result = createdReply;
    }

    await session.commitTransaction();
    session.endSession();

    return result;
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    throw new AppError(httpStatus.BAD_REQUEST, error.message);
  }
};

const getAllComments = async (query: Record<string, any>) => {
  const commentsModel = new QueryBuilder(
    Comments.find().populate([
      { path: 'user',select: 'firstName lastName photoUrl' },
      {
        path: 'reply',
        select: "user replyRef comment updatedAt",
        populate: { path: 'user',select: 'firstName lastName photoUrl' },
      },
    ]).select('user comment reply updatedAt'),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await commentsModel.modelQuery
  const meta = await commentsModel.countTotal()

  return {
    data,
    meta,
  }
}

const getCommentsById = async (id: string) => {
  const result = await Comments.findById(id).populate([
    { path: 'user', select: 'firstName lastName photoUrl' },
    {
      path: 'reply',
      populate: { path: 'user', select: 'firstName lastName photoUrl' },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Comments not found!')
  }
  return result
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
    new: true,
  }).populate([
    { path: 'user',select: 'firstName lastName photoUrl' },
     {
      path: 'reply',
      populate: { path: 'user',select: 'firstName lastName photoUrl' },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Comments')
  }
  return result
}

const deleteComments = async (id: string, userId: string) => {
  const comment = await Comments.findById(id)
  if (comment?.user?.toString() !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Unauthorized to delete this comment',
    )
  }
  const result = await Comments.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete comments')
  }

  // Now, increase the comment count for the related content
  const contentMeta = await ContentMeta.findOneAndUpdate(
    { content: comment.content },
    { $inc: { comment: -1 } },
    { new: true },
  )

  if (!contentMeta) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Content Meta not found, comment count not updated',
    )
  }

  return result
}

export const commentsService = {
  createComments,
  getAllComments,
  getCommentsById,
  updateComments,
  deleteComments,
}
