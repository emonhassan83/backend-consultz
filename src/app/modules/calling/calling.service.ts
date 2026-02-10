import { Calling } from './calling.model';
import { User } from '../user/user.model';
import { generateAgoraToken } from './calling.utils';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { Booking } from '../booking/booking.models';
import { sendNotification } from '../../utils/sentNotification';
import { modeType } from '../notification/notification.interface';
import { BOOKING_STATUS } from '../booking/booking.constants';
import { CALLING_STATUS } from './calling.constant';
import { ICalling } from './calling.interface';

const startCalling = async (
  userId: string,
  payload: ICalling,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // validate user
    const user = await User.findById(userId);
    if (!user || user?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Find Booking and authorization checked
    const booking = await Booking.findOne({
      _id: payload.bookingId,
      consult: user._id,
      status: BOOKING_STATUS.confirmed,
      isDeleted: false,
    }).session(session);
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Valid confirmed booking not found');
    }

    // Receiver (client) find out
    const receiver = await User.findById(booking.user).session(session);
    if (!receiver || receiver.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found');
    }

    // Unique channel name (booking ID + timestamp)
    const channelName = `booking_${booking._id}_${Date.now()}`;

    // Agora token generate
    const tokenData = generateAgoraToken({
      channelName,
      uid: Number(Date.now()), // unique UID
    });

    // Calling record create
    const calling = await Calling.create(
      [{
        caller: user._id,
        receiver: receiver._id,
        booking: booking._id,
        channelName,
        callId: tokenData.uid,
        isVideo: payload.isVideo,
        token: tokenData.token,
        tokenExpireAt: tokenData.expireAt,
        status: CALLING_STATUS.PENDING,
      }],
      { session },
    );

    // Send  Receiver
    if (receiver.fcmToken) {
      const notificationPayload = {
        message: payload.isVideo ? 'Incoming Video Call' : 'Incoming Voice Call',
        description: `${user.firstName} is calling you`,
        reference: calling[0]._id,
        model_type: modeType.Calling
      };

      await sendNotification([receiver.fcmToken], notificationPayload);
    }

    await session.commitTransaction();

    return {
      callId: calling[0]._id,
      channelName,
      token: tokenData.token,
      expireAt: tokenData.expireAt,
      isVideo: payload.isVideo,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// (অন্যান্য ফাংশন যেমন acceptCall, rejectCall, endCall ইত্যাদি পরে যোগ করতে পারেন)
export const CallingService = {
  startCalling,
};