import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import AppError from '../errors/AppError';
import httpStatus from 'http-status'
import { TNotification } from '../modules/notification/notification.interface';
import { Notification } from '../modules/notification/notification.model';
import { User } from '../modules/user/user.model';
import config from '../config';

const firebaseConfig = {
  type: "service_account",
  project_id: config.firebase.project_id,
  private_key_id: config.firebase.private_key_id,
  private_key: config.firebase.private_key,
  client_email: config.firebase.client_email,
  client_id: config.firebase.client_id,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: config.firebase.client_x509_cert_url,
};

initializeApp({
  credential: cert(firebaseConfig as ServiceAccount),
})

const normalizeDataPayload = (data?: Record<string, any>) => {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value === undefined || value === null ? "" : String(value),
    ])
  );
};

export const sendNotification = async (
  fcmToken: string[],
  payload: TNotification,
): Promise<any> => {
  console.log('payload', payload);
  try {
    if (!payload?.receiver) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Receiver ID is required')
    }

    if (!fcmToken || fcmToken.length === 0) {
      console.log('⚠️ No FCM tokens provided');
      return null;
    }

    // ✅ Step 1: Check if user allows notifications
    const user = await User.findById(payload.receiver).select('isNotify fcmToken')
    if (!user) {
      console.log('⚠️ Receiver not found in User collection')
      return null
    }

    // if (!user.notifySettings.all) {
    //   console.log(`🔕 Notifications are disabled for user: ${user._id}`)
    //   return { successCount: 0, skipped: true }
    // }

    const response = await getMessaging().sendEachForMulticast({
      tokens: fcmToken,
      notification: {
        title: payload.message,
        body: payload.description,
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            badge: 1,
            sound: "default",
          },
        },
      },
    });
 
    console.log(response?.responses, "from send notification");
 
    if (response.successCount > 0) {
      await Notification.create(payload);
    }
 
    console.log("Response:", response.responses);
 
    return response;
  } catch (error: any) {
    console.error("Error sending message:", error);
    if (error?.code === "messaging/third-party-auth-error") {
      return null;
    } else {
      console.error("Error sending message:", error);
      throw new AppError(
        httpStatus.NOT_IMPLEMENTED,
        error.message || "Failed to send notification",
      );
    }
  }
};

export const sendDataMessageToToken = async (
  fcmToken: string,
  data: Record<string, any>
) => {
  if (!fcmToken) return null;
  const payload = normalizeDataPayload(data);
  return getMessaging().send({
    token: fcmToken,
    data: payload,
    android: {
      priority: "high",
    },
  });
};