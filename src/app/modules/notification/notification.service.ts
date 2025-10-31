import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TNotification } from './notification.interface'
import { Notification } from './notification.model'
import moment from 'moment'
import { User } from '../user/user.model'

const createNotificationIntoDB = async (payload: TNotification) => {
  const notification = await Notification.create(payload)
  if (!notification) {
    throw new AppError(httpStatus.CONFLICT, 'Notification not created!')
  }

  //@ts-ignore
  const io = global?.socketio
  if (io) {
    const ver = 'notification::' + payload?.receiver
    io.emit(ver, { ...payload, createdAt: moment().format('YYYY-MM-DD') })
  }

  return notification
}

const sendGeneralNotificationIntoDB = async (payload: TNotification) => {
  const { message, description, ...othersData } = payload

  const userIds = (await User.distinct('_id', { role: 'user' })).map((id) =>
    id.toString(),
  )
  const notifications = userIds.map((userId) => ({
    receiver: userId,
    message,
    description,
    ...othersData,
  }))

  const notification = await Notification.insertMany(notifications)
  if (!notification) {
    throw new AppError(httpStatus.CONFLICT, 'Notification not created!')
  }

  //@ts-ignore
  const io = global?.socketio
  if (io) {
    const ver = 'notification::' + payload?.receiver
    io.emit(ver, { ...payload, createdAt: moment().format('YYYY-MM-DD') })
  }

  // return
}

const getAllNotificationFromDB = async (query: Record<string, unknown>) => {
  const notificationQuery = new QueryBuilder(Notification.find(), query)
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await notificationQuery.modelQuery
  const meta = await notificationQuery.countTotal()
  if (!notificationQuery) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found!')
  }

  return {
    meta,
    result,
  }
}

const getANotificationFromDB = async (id: string) => {
  const notification = await Notification.findById(id)
  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found!')
  }

  return notification
}

const markAsDoneFromDB = async (id: string) => {
  const result = await Notification.updateMany(
    { receiver: id },
    {
      $set: {
        read: true,
      },
    },
    { new: true },
  )
  return result
}

const deleteANotificationFromDB = async (id: string) => {
  const notification = await Notification.findById(id)
  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found!')
  }

  //if notification is already deleted
  if (notification.isDeleted) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'This notification already deleted!',
    )
  }

  const deleteNotification = await Notification.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  )

  if (!deleteNotification) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Notification not found and failed to delete!',
    )
  }

  return deleteNotification
}

const deleteAllNotificationsFromDB = async (userId: string) => {
  const result = await Notification.updateMany(
    { receiver: userId, isDeleted: false },
    { $set: { isDeleted: true } },
  )

  if (result.modifiedCount === 0) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'No notifications found or already deleted!',
    )
  }

  return result
}

export const NotificationService = {
  createNotificationIntoDB,
  sendGeneralNotificationIntoDB,
  getAllNotificationFromDB,
  getANotificationFromDB,
  markAsDoneFromDB,
  deleteANotificationFromDB,
  deleteAllNotificationsFromDB
}
