import { Types } from 'mongoose';

// Utility to check isLiked
export const enrichFeedWithUserInfo = async (feed: any, userId: string) => {
  const authorId = feed.author?._id?.toString();

  const contentMeta = feed.contentMeta as {
    likeBy?: (string | Types.ObjectId)[];
  };
  const likeBy = contentMeta?.likeBy || [];

  const isLiked = likeBy.some((id) =>
    new Types.ObjectId(id).equals(userId),
  );

  if (!authorId) {
    return {
      ...feed.toObject(),
      isLiked
    };
  }
  return {
    ...feed.toObject(),
    isLiked
  };
};
