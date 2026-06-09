// src/app/utils/voipService.ts
import apn from '@parse/node-apn';
import fs from 'fs';
import path from 'path';
import config from '../config';
import { ObjectId } from 'mongoose';

const apnProvider = new apn.Provider({
  token: {
    key: fs.readFileSync(
      path.join(__dirname, '../../../certs/AuthKey_' + config.apns.keyId + '.p8')
    ),
    keyId: config.apns.keyId as string,
    teamId: config.apns.teamId as string,
  },
  production: process.env.NODE_ENV === 'production',
  // Optional: আরও ভালো error handling
  rejectUnauthorized: true,
});

export const sendVoIPPush = async (
  voipToken: string,
  callData: {
    call_id: string;
    caller_name: string;
    caller_photo?: string;
    channel_name: string;
    agora_token: string;
    agora_uid: number;
    is_video: boolean;
    bookingId: string | ObjectId,
    expertId: string | ObjectId,
    userId: string | ObjectId
  }
): Promise<boolean> => {
  const notification = new apn.Notification();

  notification.topic = `${config.apns.bundleId}.voip`;   // খুব গুরুত্বপূর্ণ
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  notification.priority = 10;
  notification.pushType = 'alert';

  // VoIP Payload
  notification.payload = {
    aps: {
      'content-available': 1,
    },
    type: 'incoming_call',
    call_id: callData.call_id,
    caller_name: callData.caller_name,
    caller_photo: callData.caller_photo || '',
    channel_name: callData.channel_name,
    agora_token: callData.agora_token,
    agora_uid: callData.agora_uid,
    is_video: callData.is_video,
    // extra info
    bookingId: callData.bookingId,
    expertId: callData.expertId,
    userId: callData.userId
  };

  try {
    const response = await apnProvider.send(notification, voipToken);

    if (response.sent.length > 0) {
      console.log(`[VoIP Push] ✅ Successfully sent to iOS device`);
      return true;
    } else {
      console.error('[VoIP Push] ❌ Failed:', response.failed);
      return false;
    }
  } catch (error: any) {
    console.error('[VoIP Push] Error:', error.message);
    return false;
  }
};