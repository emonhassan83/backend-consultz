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

  notification.topic = `${config.apns.bundleId}.voip`;
  notification.expiry = Math.floor(Date.now() / 1000) + 7200; // 2 hours
  notification.priority = 10;
  notification.pushType = 'alert';

  // VoIP Payload
 notification.payload = {
    aps: {
      'content-available': 1,
      alert: {
        title: callData.caller_name,
        body: `Incoming ${callData.is_video ? 'Video' : 'Audio'} Call`,
      },
    },
    type: 'incoming_call',
    ...callData, // all data
  }

  try {
    const response = await apnProvider.send(notification, voipToken);

    if (response.sent.length > 0) {
      console.log(`[VoIP Push] ✅ Success for token: ${voipToken.substring(0, 15)}...`)
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