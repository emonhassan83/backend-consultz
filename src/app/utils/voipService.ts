// src/app/utils/voip.service.ts
import apn from 'apn';
import fs from 'fs';
import path from 'path';
import config from '../config';

const apnProvider = new apn.Provider({
  token: {
    key: fs.readFileSync(path.join(__dirname, '../../certs/APNsAuthKey.p8')),
    keyId: config.apns.keyId as string,
    teamId: config.apns.teamId as string,
  },
  production: process.env.NODE_ENV === 'production',
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
  }
) => {
  const notification = new apn.Notification();

  notification.topic = `${config.apns.bundleId}.voip`; // ex: com.consultzuser.app.voip
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  notification.priority = 10;
  (notification as any).pushType = 'alert';

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
  };

  try {
    const response = await apnProvider.send(notification, voipToken);
    console.log('[VoIP Push] Sent to iOS:', response.sent.length);
    return true;
  } catch (error: any) {
    console.error('[VoIP Push] Failed:', error);
    return false;
  }
};