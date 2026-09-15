// src/app/utils/voipService.ts
import apn from '@parse/node-apn';
import fs from 'fs';
import path from 'path';
import config from '../config';
import { ObjectId } from 'mongoose';

type TVoIPPushResult = {
  success: boolean;
  reason?: string;
};

const apnProvider = new apn.Provider({
  token: {
    key: fs.readFileSync(
      path.join(__dirname, '../../../certs/AuthKey_' + config.apns.keyId + '.p8')
    ),
    keyId: config.apns.keyId as string,
    teamId: config.apns.teamId as string,
  },
  production: config.apns.production,
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
): Promise<TVoIPPushResult> => {
  const notification = new apn.Notification();

  notification.topic = `${config.apns.bundleId}.voip`;   // খুব গুরুত্বপূর্ণ
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  notification.priority = 10;
  notification.pushType = 'voip';

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
    channelName: callData.channel_name,
    token: callData.agora_token,
    uid: callData.agora_uid,
    is_video: callData.is_video,
    isVideo: callData.is_video,
    // extra info
    bookingId: callData.bookingId,
    expertId: callData.expertId,
    userId: callData.userId
  };

  try {
    const response = await apnProvider.send(notification, voipToken);

    if (response.sent.length > 0) {
      console.log(
        `[VoIP Push] ✅ Sent via ${config.apns.production ? 'production' : 'sandbox'} gateway`,
      );
      return { success: true };
    } else {
      console.error(
        `[VoIP Push] ❌ Failed (${config.apns.production ? 'production' : 'sandbox'}):`,
        response.failed,
      );
      return {
        success: false,
        reason: response.failed?.[0]?.response?.reason,
      };
    }
  } catch (error: any) {
    console.error('[VoIP Push] Error:', error.message);
    return { success: false, reason: error.message };
  }
};
