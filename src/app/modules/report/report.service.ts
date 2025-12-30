import QueryBuilder from '../../builder/QueryBuilder'
import { IReport } from './report.interface'
import { REPORT_STATUS } from './report.constant'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Feed } from '../feed/feed.model'
import { Report } from './report.models'

const createReport = async (payload: IReport) => {
  const { author: authorId, feed: feedId } = payload

  // 1. Validate Author
  const author = await User.findById(authorId)
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Author not found!')
  }

  const feed = await Feed.findById(feedId)
  if (!feed || feed.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, `Feed not found!`)
  }

  // 4. 🔁 Check for duplicate pending reports
  const existingReport = await Report.findOne({
    author: authorId,
    feed: feedId,
    status: REPORT_STATUS.pending,
  })

  if (existingReport) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You have already submitted a report for this feed!',
    )
  }

  // 5. ✅ Create report
  const report = await Report.create(payload)
  if (!report) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Report creation failed!')
  }

  return report
}

const getAllReport = async (query: Record<string, any>) => {
  const reportModel = new QueryBuilder(
    Report.find().populate([
      { path: 'author', select: 'name photoUrl email' },
      {
        path: 'feed',
        populate: {
          path: 'author', // example subfield inside the feed document
          select: 'name email photoUrl',
        },
      },
    ]),
    query,
  )
    .search(['author.name'])
    .filter()
    .paginate()
    .sort()

  const data: any = await reportModel?.modelQuery
  const meta = await reportModel?.countTotal()

  return { data, meta }
}

const getReportById = async (id: string) => {
  const result = await Report.findById(id).populate([
    { path: 'author', select: 'name photoUrl email' },
    {
      path: 'feed',
      populate: {
        path: 'author', // example subfield inside the feed document
        select: 'name email photoUrl',
      },
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report history not found!')
  }

  return result
}

const updateReport = async (id: string, payload: Partial<IReport>) => {
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  const updatedReport = await Report.findByIdAndUpdate(id, payload, {
    new: true,
  })
  if (!updatedReport) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Report updated failed !')
  }

  return updatedReport
}

const changeStatusReport = async (
  id: string,
  payload: { status: (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS] },
) => {
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  // Prevent updating if report already has a terminal status
  if (report.status !== REPORT_STATUS.pending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot change status from ${report.status}.`,
    )
  }

  if (payload.status === REPORT_STATUS.denied) {
    const result = await Report.findByIdAndDelete(id)
    if (!result) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Report status can not update!',
      )
    }
    return result
  }
}

const deleteReport = async (id: string) => {
  const report = await Report.findById(id)
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found!')
  }

  const deletedReport = await Report.findByIdAndDelete(id)
  if (!deletedReport) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Report history updated failed !',
    )
  }

  return deletedReport
}

export const ReportService = {
  createReport,
  getAllReport,
  getReportById,
  updateReport,
  changeStatusReport,
  deleteReport,
}
