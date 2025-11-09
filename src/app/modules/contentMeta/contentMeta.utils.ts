import { modeType } from '../notification/notification.interface';
import { messages } from '../notification/notification.constant';
import { NotificationService } from '../notification/notification.service';
import { Types } from 'mongoose';

type TCarRatingLikeNotificationPayload = {
  ratingId: Types.ObjectId | string;
  likedBy: {
    _id: Types.ObjectId;
    name: string;
  };
  authorId: Types.ObjectId;
};

export const sendCarRatingLikeNotificationToAuthor = async (
  payload: TCarRatingLikeNotificationPayload
) => {
  const { ratingId, likedBy, authorId } = payload;

  const message = messages.carRatingManagement.addRating;
  const description = `${likedBy.name} liked your car rating.`;

  await NotificationService.createNotificationIntoDB({
    receiver: authorId,
    reference: ratingId,
    message,
    description,
    model_type: modeType.CarRating,
  });
};
