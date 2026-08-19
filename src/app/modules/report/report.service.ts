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

const getAllReport = async (query: Record<string, any>) => {
  const reportModel = new QueryBuilder(
    Report.find().populate([
      { path: 'author', select: 'firstName lastName photoUrl expertise' },
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

const getReportById = async (id: string) => {
  const result: any = await Report.findById(id).populate([
    { path: 'author', select: 'firstName lastName photoUrl expertise' },
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

export const ReportService = {
  createReport,
  getAllReport,
  getReportById,
  deleteReport,
}
