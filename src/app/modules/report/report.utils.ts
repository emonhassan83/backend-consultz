import { NotificationService } from '../notification/notification.service';
import { modeType } from '../notification/notification.interface';
import { User } from '../user/user.model';
import { Notification } from '../notification/notification.model';
import { getMessaging } from 'firebase-admin/messaging';
import emailSender from '../../utils/emailSender';
import config from '../../config';
import { USER_ROLE } from '../user/user.constant';
import { Report } from './report.models';
import {
  buildAdminReportMessage,
  escapeHtml,
  getAdminAlertRecipients,
  truncate,
} from './report.helpers';

const fullName = (u: any) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'A user';

/**
 * Alert every admin about a new post report (#68): a dashboard notification
 * (saved even without an FCM token), a socket event, a push if the admin has
 * a token, and an email. Never throws: the report itself must still succeed.
 */
export const notifyAdminsOfReport = async (params: {
  feed: any;
  reporter: any;
  reason: string;
}) => {
  const { feed, reporter, reason } = params;
  try {
    const admins = await User.find({ role: USER_ROLE.admin, isDeleted: false })
      .select('_id email fcmToken')
      .lean();

    const author = feed.author || {};
    const { message, description } = buildAdminReportMessage({
      reporterName: fullName(reporter),
      authorName: fullName(author),
      reason,
    });

    // 1. Dashboard notification + socket, per admin
    if (admins.length) {
      const docs = await Notification.insertMany(
        admins.map((admin) => ({
          receiver: admin._id,
          message,
          description,
          reference: feed._id,
          modelType: modeType.Feed,
        })),
      );

      // @ts-ignore
      const io = global?.socketio;
      if (io) {
        docs.forEach((doc: any) => {
          // Only the admin's own room (each socket joins its userId room on
          // connect), not every connected client. Event name is unchanged.
          io.to(String(doc.receiver)).emit(`notification::${doc.receiver}`, doc.toObject());
        });
      }

      // 2. Push, only for admins with a token (the doc is already saved)
      const tokens = admins.map((a) => a.fcmToken).filter(Boolean) as string[];
      if (tokens.length) {
        try {
          await getMessaging().sendEachForMulticast({
            tokens,
            notification: { title: message, body: description },
          });
        } catch (err) {
          console.error('[notifyAdminsOfReport] push failed', err);
        }
      }
    }

    // 3. Email
    const recipients = getAdminAlertRecipients(
      config.admin_notify_email,
      admins.map((a) => a.email),
    );
    if (recipients.length) {
      const totalReports = await Report.countDocuments({ feed: feed._id });
      const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">A post was reported</h2>
          <p style="color: #555;"><strong>Reported by:</strong> ${escapeHtml(fullName(reporter))} (${escapeHtml(reporter?.email)})</p>
          <p style="color: #555;"><strong>Post author:</strong> ${escapeHtml(fullName(author))} (${escapeHtml(author?.email)})</p>
          <p style="color: #555;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          <p style="color: #555;"><strong>Post:</strong> ${escapeHtml(truncate(feed.description, 300)) || '(no text)'}</p>
          <p style="color: #555;"><strong>Post ID:</strong> ${escapeHtml(feed._id)}</p>
          <p style="color: #555;"><strong>Reports on this post:</strong> ${totalReports}</p>
          <p style="color: #555;"><strong>Time:</strong> ${new Date().toUTCString()}</p>
          <p style="color: #555;">Please review it in the Admin dashboard (Posts → Pending review).</p>
        </div>
      </div>`;

      for (const to of recipients) {
        try {
          await emailSender(to, 'New report on Consultz: action needed', html);
        } catch (err) {
          console.error('[notifyAdminsOfReport] email failed', to, err);
        }
      }
    }
  } catch (err) {
    console.error('[notifyAdminsOfReport] failed', err);
  }
};

export const sendContentBlockedNotification = async (
  authorId: string
) => {
  const user = await User.findById(authorId);
  if (!user) return;

  const message = `Your feed has been blocked`;
  const description = `Dear ${user.firstName}, your feed was reported and has been soft deleted due to policy violation.`;

  await NotificationService.createNotificationIntoDB({
    receiver: user._id,
    message,
    description,
    modelType: modeType.Feed,
  });
};
