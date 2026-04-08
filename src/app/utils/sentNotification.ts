import admin from 'firebase-admin';
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

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig as admin.ServiceAccount),
});

export const sendNotification = async (
  fcmToken: string[],
  payload: TNotification,
): Promise<any> => {
  console.log('payload', payload);
  try {
    if (!payload?.receiver) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Receiver ID is required')
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

    const response = await admin.messaging().sendEachForMulticast({
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
 
    if (response.successCount) {
      fcmToken?.map(async (token) => {
        try {
          if (token) {
 
            await Notification.create(payload);
 
          } else {
            console.log("Token not found");
          }
        } catch (error) {
          console.log(error);
        }
      });
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