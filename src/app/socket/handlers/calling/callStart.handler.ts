// src/app/socket/handlers/call/callStart.handler.ts
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Calling } from '../../../modules/calling/calling.model'
import { User } from '../../../modules/user/user.model'
import { callbackFn } from '../../../utils/CallbackFn'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import AppError from '../../../errors/AppError'
import { Booking } from '../../../modules/booking/booking.models'
import { BOOKING_STATUS } from '../../../modules/booking/booking.constants'
import {
  generate32BitUid,
  generateAgoraToken,
} from '../../../modules/calling/calling.utils'
import { CALLING_STATUS } from '../../../modules/calling/calling.constant'
import onlineUsers from '../../utils/onlineUsers'
import { sendDataMessageToToken } from '../../../utils/sentNotification'

type TCallStartPayload = {
  bookingId: string
  isVideo: boolean
}

const callStart = eventHandler<TCallStartPayload>(
  async (socket: TSocket, payload, callback) => {
    const callerId = socket.auth._id.toString()
 
    console.log('\n📞 callStart handler triggered')
    console.log('   Caller  :', callerId)
    console.log('   Payload :', payload)
 
    // ─── Payload Validation ───────────────────────────────────────────
    if (!payload?.bookingId) {
      return callbackFn(callback, {
        success: false,
        message: 'bookingId is required',
      })
    }
 
    const { bookingId, isVideo = false } = payload
 
    const session = await mongoose.startSession()
    session.startTransaction()
 
    try {
      // ─── 1. Validate Caller ──────────────────────────────────────────
      const caller = await User.findById(callerId)
      if (!caller || caller.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Caller not found')
      }
 
      // ─── 2. Validate Booking ─────────────────────────────────────────
      const booking = await Booking.findOne({
        _id: bookingId,
        status: BOOKING_STATUS.confirmed,
        isDeleted: false,
        $or: [{ user: callerId }, { consult: callerId }],
      }).session(session)
 
      if (!booking) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Valid confirmed booking not found',
        )
      }
 
      // ─── 3. Determine Receiver ───────────────────────────────────────
      const receiverId =
        booking.user.toString() === callerId ? booking.consult : booking.user
 
      const receiver = await User.findById(receiverId).session(session)
      if (!receiver || receiver.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found')
      }
 
      // ─── 4. Generate Unique UIDs & Tokens for Each Participant ───────
      const channelName = `booking_${booking._id}_${Date.now()}`
 
      // ✅ Caller এবং Receiver এর জন্য সম্পূর্ণ আলাদা UID
      const callerUid   = generate32BitUid()
      const receiverUid = generate32BitUid()
 
      // ✅ প্রত্যেকের নিজের UID দিয়ে আলাদা token generate
      const callerTokenData   = generateAgoraToken({ channelName, uid: callerUid })
      const receiverTokenData = generateAgoraToken({ channelName, uid: receiverUid })
 
      console.log(`   Channel      : ${channelName}`)
      console.log(`   Caller UID   : ${callerUid}`)
      console.log(`   Receiver UID : ${receiverUid}`)
 
      // ─── 5. Create Calling Document ──────────────────────────────────
      const [calling] = await Calling.create(
        [
          {
            caller:        caller._id,
            receiver:      receiver._id,
            booking:       booking._id,
            channelName,
            callId:        callerUid,
            isVideo,
            token:         callerTokenData.token,
            tokenExpireAt: callerTokenData.expireAt,
            status:        CALLING_STATUS.pending,
            participants: [
              {
                user:     caller._id,
                role:     'caller',
                status:   CALLING_STATUS.pending,
                agoraUid: callerUid,   // ✅ caller এর unique UID
                joinedAt: new Date(),
              },
              {
                user:     receiver._id,
                role:     'receiver',
                status:   CALLING_STATUS.pending,
                agoraUid: receiverUid, // ✅ receiver এর unique UID
                joinedAt: null,
              },
            ],
          },
        ],
        { session },
      )
 
      await session.commitTransaction()
      console.log(`✅ Call created | CallId: ${calling._id}`)
 
      // ─── 6. Respond to Caller (caller এর নিজের token+uid) ───────────
      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success:    true,
        message:    'Call started successfully',
        data: {
          callId:      calling._id,
          channelName,
          token:       callerTokenData.token,  // ✅ caller এর token
          uid:         callerUid,              // ✅ caller এর uid
          expireAt:    callerTokenData.expireAt,
          isVideo,
        },
      })
 
      // ─── 7. Build Receiver Payload (receiver এর নিজের token+uid) ─────
      const callerName =
        `${caller.firstName || ''} ${caller.lastName || ''}`.trim() || 'User'
 
      const callIncomingPayload = {
        callId:      calling._id,
        callerId:    caller._id,
        callerName,
        callerPhoto: caller.photoUrl || '',
        isVideo,
        channelName,
        token:       receiverTokenData.token,  // ✅ receiver এর token
        uid:         receiverUid,              // ✅ receiver এর uid
        expireAt:    receiverTokenData.expireAt,
      }
 
      const receiverRoom   = receiver._id.toString()
      const receiverSocket = onlineUsers[receiverRoom]
 
      // ─── 8. Socket Emit (app foreground/active) ───────────────────────
      if (receiverSocket) {
        receiverSocket.emit('callIncoming', callIncomingPayload)
        console.log(`✅ callIncoming via socket  → ${receiverRoom}`)
      } else {
        console.log(`⚠️  Receiver offline        → ${receiverRoom}`)
      }
 
      // ─── 9. FCM Push (background/killed/offline সব অবস্থায়) ─────────
      // Socket পাঠালেও FCM পাঠাও — app background এ socket miss হতে পারে
      if (receiver.fcmToken) {
        sendDataMessageToToken(receiver.fcmToken, {
          type:            'incoming_call',
          call_id:         calling._id.toString(),
          caller_id:       caller._id.toString(),
          caller_name:     callerName,
          caller_photo:    caller.photoUrl || '',
          is_video:        String(isVideo), 
          channel_name:    channelName,
          agora_token:     receiverTokenData.token,     
          agora_uid:       String(receiverUid),        
          token_expire_at: String(receiverTokenData.expireAt),
        })
          .then(() => console.log(`✅ FCM sent             → ${receiverRoom}`))
          .catch((err: any) =>
            console.error(`❌ FCM failed: ${err.message}`),
          )
      } else {
        console.log(`⚠️  No FCM token           → ${receiverRoom}`)
      }
 
    } catch (error: any) {
      await session.abortTransaction()
      console.error('❌ callStart error:', error.message)
 
      callbackFn(callback, {
        success: false,
        message: error.message || 'Failed to start call',
      })
    } finally {
      session.endSession()
    }
  },
)

export default callStart
