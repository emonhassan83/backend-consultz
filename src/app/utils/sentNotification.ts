import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import AppError from '../errors/AppError';
import httpStatus from 'http-status';
import { TNotification } from '../modules/notification/notification.interface';
import { Notification } from '../modules/notification/notification.model';
import { User } from '../modules/user/user.model';
import config from '../config';

// Initialize Firebase Admin (once)
const firebaseConfig = {
  type: 'service_account',
  project_id: config.firebase.project_id,
  private_key_id: config.firebase.private_key_id,
  private_key: config.firebase.private_key,
  client_email: config.firebase.client_email,
  client_id: config.firebase.client_id,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: config.firebase.client_x509_cert_url,
} as ServiceAccount;

initializeApp({
  credential: cert(firebaseConfig),
});

const normalizeDataPayload = (data?: Record<string, any>) => {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value === undefined || value === null ? '' : String(value),
    ])
  );
};

/**
 * General Notification (with title + body)
 */
export const sendNotification = async (
  fcmToken: string[],
  payload: TNotification,
): Promise<any> => {
  console.log('📤 Sending Notification:', payload);

  try {
    if (!payload?.receiver) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Receiver ID is required');
    }

    if (!fcmToken || fcmToken.length === 0) {
      console.warn('⚠️ No FCM tokens provided');
      return null;
    }

    // Optional: Check user notification preference
    const user = await User.findById(payload.receiver).select('fcmToken');
    if (!user) {
      console.warn('⚠️ Receiver not found');
      return null;
    }

    const response = await getMessaging().sendEachForMulticast({
      tokens: fcmToken,
      notification: {
        title: payload.message,
        body: payload.description || '',
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
    });

    console.log('✅ Notification sent:', response.successCount, 'success');

    // Save to database if successful
    if (response.successCount > 0) {
      await Notification.create(payload);
    }

    return response;
  } catch (error: any) {
    console.error('❌ Error sending notification:', error);
    if (error?.code === 'messaging/third-party-auth-error') {
      return null;
    }
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to send notification'
    );
  }
};

/**
 * Data-only message (Used for Incoming Call)
 */
export const sendDataMessageToToken = async (
  fcmToken: string,
  data: Record<string, any>
): Promise<any> => {
  if (!fcmToken) {
    console.warn('⚠️ No FCM token provided for data message');
    return null;
  }

  try {
    const payload = normalizeDataPayload(data);

    const response = await getMessaging().send({
      token: fcmToken,
      data: payload,
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-push-type': 'background',
        },
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    });

    console.log(`✅ Data message sent to token: ${fcmToken.substring(0, 15)}...`);
    return response;
  } catch (error: any) {
    console.error('❌ Error sending data message:', error);
    return null;
  }
};