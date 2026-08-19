import httpStatus from 'http-status'
import QueryBuilder from '../../builder/QueryBuilder'
import AppError from '../../errors/AppError'
import { Feed } from '../feed/feed.model'
import { FEED_STATUS } from '../feed/feed.constant'
import { Report } from '../report/report.models'
import { REPORT_STATUS } from '../report/report.constant'
import { sendContentModerationNotification } from '../feed/feed.utils'
import { TUser } from '../user/user.interface'
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

  if (feed.status !== FEED_STATUS.restrict) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Appeal can only be submitted for restricted posts',
    )
  }

  const unresolvedReport = await Report.findOne({
    feed: payload.feed,
    status: { $ne: REPORT_STATUS.denied },
  })

  if (!unresolvedReport) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No active report found for this feed',
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

const getAllAppealsFromDB = async (query: Record<string, unknown>) => {
  const appealQuery = new QueryBuilder(
    Appeal.find().populate([
      { path: 'user', select: 'firstName lastName email photoUrl' },
      {
        path: 'feed',
        populate: {
          path: 'author',
          select: 'firstName lastName email photoUrl',
        },
      },
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

const decideAppealIntoDB = async (
  id: string,
  payload: { status: 'approved' | 'rejected'; note?: string },
) => {
  const appeal = await Appeal.findById(id)
  if (!appeal) {
    throw new AppError(httpStatus.NOT_FOUND, 'Appeal not found!')
  }

  if (appeal.status !== APPEAL_STATUS.pending) {
    throw new AppError(httpStatus.BAD_REQUEST, `Appeal already ${appeal.status}`)
  }

  const feed: any = await Feed.findOne({
    _id: appeal.feed,
    isDeleted: false,
  } as any).populate('author', 'firstName lastName email fcmToken pushNotify emailNotify')

  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found!')
  }

  appeal.status = payload.status

  if (payload.status === APPEAL_STATUS.approved) {
    feed.status = FEED_STATUS.active
    await feed.save()
    await Report.updateMany(
      { feed: appeal.feed, status: { $ne: REPORT_STATUS.denied } },
      { status: REPORT_STATUS.denied },
    )
    await sendContentModerationNotification(
      'appealApproved',
      feed.author as unknown as TUser,
      feed,
      payload.note || appeal.reason,
    )
  } else {
    await sendContentModerationNotification(
      'appealRejected',
      feed.author as unknown as TUser,
      feed,
      payload.note || appeal.reason,
    )
  }

  await appeal.save()

  return appeal
}

export const AppealService = {
  createAppealIntoDB,
  getAllAppealsFromDB,
  decideAppealIntoDB,
}
