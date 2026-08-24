import httpStatus from 'http-status'
import QueryBuilder from '../../builder/QueryBuilder'
import AppError from '../../errors/AppError'
import { Feed } from '../feed/feed.model'
import { APPEAL_STATUS } from './appeal.constant'
import { TAppeal } from './appeal.interface'
import { Appeal } from './appeal.model'

const createAppealIntoDB = async (
  payload: Pick<TAppeal, 'feed' | 'reason' | 'files'>,
  userId: string,
) => {
  const feed: any = await Feed.findOne({
    _id: payload.feed,
    isDeleted: false,
  } as any).populate('author', 'firstName lastName email fcmToken pushNotify emailNotify')

  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found!')
  }

  const feedAuthorId = (feed.author as any)?._id?.toString()
  if (feedAuthorId !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only the post author can appeal this feed',
    )
  }

  const existingPendingAppeal = await Appeal.findOne({
    feed: payload.feed,
    user: userId,
    status: APPEAL_STATUS.pending,
  })

  if (existingPendingAppeal) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You already have a pending appeal for this feed',
    )
  }

  const appeal = await Appeal.create({
    feed: payload.feed,
    user: userId,
    reason: payload.reason,
    files: payload.files,
    status: APPEAL_STATUS.pending,
  })

  return appeal
}

const getAppealsByFeedFromDB = async (
  feedId: string,
  query: Record<string, unknown>,
) => {
  const feed = await Feed.findOne({ _id: feedId, isDeleted: false })
  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found!')
  }

  const appealQuery = new QueryBuilder(
    Appeal.find({ feed: feedId }).populate([
      { path: 'user', select: 'firstName lastName email photoUrl' }
    ]),
    query,
  )
    .filter()
    .sort()
    .paginate()
    .fields()

  const data = await appealQuery.modelQuery
  const meta = await appealQuery.countTotal()

  return { data, meta }
}

export const AppealService = {
  createAppealIntoDB,
  getAppealsByFeedFromDB,
}
