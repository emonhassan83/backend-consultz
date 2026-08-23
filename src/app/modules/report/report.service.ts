import QueryBuilder from '../../builder/QueryBuilder'
import { IReport } from './report.interface'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Feed } from '../feed/feed.model'
import { Report } from './report.models'
import mongoose from 'mongoose'
import { sendContentModerationNotification } from '../feed/feed.utils'
import { TUser } from '../user/user.interface'
import { Appeal } from '../appeal/appeal.model'

const createReport = async (payload: IReport, userId: string) => {
  const { feed: feedId } = payload

  const author = await User.findById(userId)
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Author not found!')
  }

  const feed = await Feed.findById(feedId).populate(
    'author',
    'firstName lastName email fcmToken pushNotify emailNotify',
  )
  if (!feed || feed.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, `Feed not found!`)
  }

  const existingReport = await Report.findOne({
    author: userId,
    feed: feedId,
  })

  if (existingReport) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You have already submitted a report for this feed!',
    )
  }

  payload.author = new mongoose.Types.ObjectId(userId)
  payload.feedAuthor = new mongoose.Types.ObjectId(
    (feed.author as any)._id?.toString() || feed.author.toString(),
  )

  const report = await Report.create(payload)
  if (!report) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Report creation failed!')
  }

  const feedAuthor = feed.author as unknown as TUser
  await sendContentModerationNotification(
    'reported',
    feedAuthor,
    feed,
    payload.reason,
  )

  return report
}

const attachAppealSubmittedStatus = async (reports: any[], userId: string) => {
  if (!reports.length) return reports

  const reportIds = reports.map((report) => report._id)
  const appeals = await Appeal.find({
    report: { $in: reportIds },
    user: new mongoose.Types.ObjectId(userId),
  })
    .select('report')
    .lean()

  const appealedReportSet = new Set(
    appeals.map((appeal) => appeal.report.toString()),
  )

  return reports.map((report) => ({
    ...report,
    isAppalSubmit: appealedReportSet.has(report._id.toString()),
  }))
}

const getAllReport = async (query: Record<string, any>) => {
  const reportModel = new QueryBuilder(
    Report.find().populate([
      { path: 'author', select: 'firstName lastName photoUrl expertise' },
      { path: 'feedAuthor', select: 'firstName lastName photoUrl expertise' },
      {
        path: 'feed',
        populate: {
          path: 'author',
          select: 'firstName lastName photoUrl expertise',
        },
      },
    ]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()

  const data: any = await reportModel?.modelQuery
  const meta = await reportModel?.countTotal()

  return { data, meta }
}

const getReportsByFeed = async (
  feedId: string,
  query: Record<string, any>,
  userId: string,
  role?: string,
) => {
  const feed = await Feed.findOne({ _id: feedId, isDeleted: false }).select(
    'author',
  )

  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found!')
  }

  if (role !== 'admin' && feed.author.toString() !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only view reports for your own feed',
    )
  }

  const reportModel = new QueryBuilder(
    Report.find({ feed: feedId }).populate([
      {
        path: 'feed',
        populate: {
          path: 'author',
          select: 'firstName lastName photoUrl expertise',
        },
      },
    ]),
    query,
  )
    .search(['reason'])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await reportModel.modelQuery.lean()
  const meta = await reportModel.countTotal()

  return {
    data: await attachAppealSubmittedStatus(data, userId),
    meta,
  }
}

const getReportById = async (id: string, userId?: string) => {
  const result: any = await Report.findById(id).populate([
    { path: 'author', select: 'firstName lastName photoUrl expertise' },
    { path: 'feedAuthor', select: 'firstName lastName photoUrl expertise' },
    {
      path: 'feed',
      populate: {
        path: 'author',
        select: 'firstName lastName photoUrl expertise',
      },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report history not found!')
  }

  const appeals = await Appeal.find({ report: id })
    .populate('user', 'firstName lastName email photoUrl')
    .sort({ createdAt: -1 })
    .lean()

  return {
    ...result.toObject(),
    appeals,
    isAppalSubmit: userId
      ? Boolean(await Appeal.exists({ report: id, user: userId }))
      : false,
  }
}

const deleteReport = async (id: string) => {
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  const result = await Report.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Report history deleted failed !',
    )
  }

  return result
}

const deleteReportByFeedId = async (feedId: string, userId: string) => {
  const reports = await Report.find({ feed: feedId, author: userId }).lean()

  if (!reports.length) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only delete reports that you submitted for this feed',
    )
  }

  const feed = await Feed.findOne({ _id: feedId, isDeleted: false }).populate(
    'author',
    'firstName lastName email fcmToken pushNotify emailNotify',
  )

  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found!')
  }

  const reportIds = reports.map((report) => report._id)

  const [reportResult, appealResult] = await Promise.all([
    Report.deleteMany({ _id: { $in: reportIds }, author: userId }),
    Appeal.deleteMany({ report: { $in: reportIds } }),
  ])

  await sendContentModerationNotification(
    'reportWithdrawn',
    feed.author as unknown as TUser,
    feed,
    'The reporter deleted their report.',
  )

  return {
    feed: feedId,
    deletedReports: reportResult.deletedCount || 0,
    deletedAppeals: appealResult.deletedCount || 0,
  }
}

export const ReportService = {
  createReport,
  getAllReport,
  getReportsByFeed,
  getReportById,
  deleteReportByFeedId,
  deleteReport,
}
