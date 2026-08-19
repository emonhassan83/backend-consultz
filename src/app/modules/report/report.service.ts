import QueryBuilder from '../../builder/QueryBuilder'
import { IReport } from './report.interface'
import { REPORT_STATUS } from './report.constant'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Feed } from '../feed/feed.model'
import { Report } from './report.models'
import { FEED_STATUS } from '../feed/feed.constant'
import mongoose from 'mongoose'
import { sendContentModerationNotification } from '../feed/feed.utils'
import { TUser } from '../user/user.interface'
import { Appeal } from '../appeal/appeal.model'

const createReport = async (payload: IReport, userId: string) => {
  const { feed: feedId } = payload

  // 1. Validate Author
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

  // 4. 🔁 Check for duplicate pending reports
  const existingReport = await Report.findOne({
    author: userId,
    feed: feedId,
    status: REPORT_STATUS.pending,
  })

  if (existingReport) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You have already submitted a report for this feed!',
    )
  }
  // set author
  payload.author = new mongoose.Types.ObjectId(userId)

  // 5. ✅ Create report
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
        path: 'author', // example subfield inside the feed document
        select: 'firstName lastName photoUrl expertise',
      },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report history not found!')
  }

  const appeals = await Appeal.find({ feed: result.feed?._id || result.feed })
    .populate('user', 'firstName lastName email photoUrl')
    .sort({ createdAt: -1 })
    .lean()

  return {
    ...result.toObject(),
    appeals,
  }
}

const updateReport = async (id: string, payload: Partial<IReport>) => {
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  const updatedReport = await Report.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
  })
  if (!updatedReport) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Report updated failed !')
  }

  return updatedReport
}

const changeStatusReport = async (
  id: string,
  payload: { status: keyof typeof REPORT_STATUS },
) => {
  const { status } = payload

  // 1. Validate status
  if (!Object.values(REPORT_STATUS).includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid report status')
  }

  // 2. Find report
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  // 3. Prevent duplicate action
  if (report.status !== REPORT_STATUS.pending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Report already ${report.status}`,
    )
  }

  // 4. Update report status
  report.status = status
  await report.save()

  // 5. If approved → restrict feed
  if (status === REPORT_STATUS.approved) {
    const feed = await Feed.findOne({
      _id: (report.feed).toString(),
      isDeleted: false,
    }).populate('author', 'firstName lastName email fcmToken pushNotify emailNotify')

    if (!feed) {
      throw new AppError(httpStatus.NOT_FOUND, 'Reported feed not found')
    }

    // Avoid unnecessary write
    if (feed.status !== FEED_STATUS.restrict) {
      feed.status = FEED_STATUS.restrict
      await feed.save()
    }

    await sendContentModerationNotification(
      'restricted',
      feed.author as unknown as TUser,
      feed,
      'Report approved by admin',
    )
  }

  return report
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
  updateReport,
  changeStatusReport,
  deleteReport,
}
