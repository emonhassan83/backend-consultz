import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TNotification } from './notification.interface'
import { Notification } from './notification.model'
import moment from 'moment'
import { User } from '../user/user.model'
import { sendNotification } from '../../utils/sentNotification'
import { USER_ROLE } from '../user/user.constant'

const createNotificationIntoDB = async (payload: TNotification) => {
  const {
    receiver,
    message,
    description = '',
    reference,
    modelType,
    ...othersData
  } = payload;

  // 1. Validate receiver
  const user = await User.findById(receiver).select('fcmToken isDeleted');
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Receiver user not found!');
  }

  // 2. Create notification in database
  const notification = await Notification.create({
    receiver,
    message,
    description,
    reference,
    modelType,
    ...othersData,        // যদি আরও কোনো ফিল্ড থাকে
  });

  if (!notification) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create notification');
  }

  // 3. Real-time socket notification (if socketio is available)
  try {
    // @ts-ignore
    const io = global?.socketio;
    if (io) {
      const eventName = `notification::${receiver}`;
      io.emit(eventName, {
        ...notification.toObject(),
        createdAt: new Date(), // or moment().format('YYYY-MM-DD HH:mm:ss')
      });
    }
  } catch (socketError: any) {
    console.warn('Socket emission failed (non-critical):', socketError.message);
  }

  // 4. Push notification via FCM (if token exists)
  if (user.fcmToken) {
    const notifyPayload = {
      receiver: user._id,
      message,
      description,
      reference: reference || null,
      modelType: modelType,
    };

    try {
      await sendNotification([user.fcmToken], notifyPayload);
    } catch (fcmError: any) {
      console.warn('FCM notification failed (non-critical):', fcmError.message);
      // Don't throw error here — notification creation should still succeed
    }
  }

  return notification;
};

const sendGeneralNotificationIntoDB = async (payload: TNotification) => {
  const { message, description, ...othersData } = payload

  const userIds = (await User.distinct('_id', { role: USER_ROLE.consult })).map((id) =>
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

const getAllNotificationFromDB = async (
  query: Record<string, unknown>,
  userId: string, // ← receiver হিসেবে userId নেওয়া উচিত
) => {
  // Base filter: শুধু এই user-এর notification
  const baseFilter = {
    receiver: userId,
    isDeleted: false,
  }

  // 1. Unread message count (read: false)
  const unreadCount = await Notification.countDocuments({
    ...baseFilter,
    read: false,
  })

  // 2. Get all notifications with pagination
  const notificationQuery = new QueryBuilder(
    Notification.find(baseFilter)
      // .populate([
      //   {
      //     path: 'reference',
      //     select: 'description sessionType', // প্রয়োজন অনুযায়ী populate করো
      //   },
      // ])
      .select('message description date read modelType createdAt'),
    query,
  )
    .filter()
    .sort() // newest first
    .paginate()
    .fields()

  const notifications = await notificationQuery.modelQuery
  const meta = await notificationQuery.countTotal()

  return {
    meta,
    data: {
      unreadMessage: unreadCount, // ← নতুন যোগ করা হলো
      notifications, // list of notifications
    },
  }
}

const getANotificationFromDB = async (id: string) => {
  const notification = await Notification.findById(id)
  if (!notification || notification?.isDeleted) {
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
  deleteAllNotificationsFromDB,
}
