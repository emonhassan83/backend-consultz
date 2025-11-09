import { Follow } from './connection.models';
import httpStatus from 'http-status';
import { sendUserFollowNotify } from './connection.utils';
import { User } from '../user/user.model';
import AppError from '../../errors/AppError';

const followUser = async (followerId: string, followingId: string) => {
  // 1. Prevent following self
  if (followerId === followingId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot follow yourself');
  }

  // 2. Check if both users exist and are active
  const [follower, following] = await Promise.all([
    User.findById(followerId),
    User.findById(followingId),
  ]);

  if (!follower || follower.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid follower user');
  }

  if (!following || following.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid target user to follow');
  }

  // 3. Check for existing follow
  const alreadyFollowing = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });
  if (alreadyFollowing) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Already following this user');
  }

  // 4. Create the follow relationship
  const follow = await Follow.create({
    follower: followerId,
    following: followingId,
  });

  // 5. Update follower/following counts
  await Promise.all([
    User.findByIdAndUpdate(followerId, { $inc: { following: 1 } }),
    User.findByIdAndUpdate(followingId, { $inc: { followers: 1 } }),
  ]);

  // 6. Notify the followed user
  await sendUserFollowNotify('follow', followerId, followingId);

  return follow;
};

const unfollowUser = async (followerId: string, followingId: string) => {
  // 1. Prevent unfollowing self
  if (followerId === followingId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot unfollow yourself');
  }

  // 2. Check if both users exist
  const [follower, following] = await Promise.all([
    User.findById(followerId),
    User.findById(followingId),
  ]);

  if (!follower || follower.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid follower user');
  }

  if (!following || following.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid target user to unfollow');
  }

  // 3. Attempt to remove the follow relationship
  const result = await Follow.findOneAndDelete({
    follower: followerId,
    following: followingId,
  });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Not following this user');
  }

  // 4. Update follower/following counts
  await Promise.all([
    User.findByIdAndUpdate(followerId, { $inc: { following: -1 } }),
    User.findByIdAndUpdate(followingId, { $inc: { followers: -1 } }),
  ]);

  // 5. Notify the unfollowed user
  await sendUserFollowNotify('unfollow', followerId, followingId);

  return result;
};

const getAllFollowers = async (userId: string) => {
  // 1. Check if the user exists and is active
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or inactive');
  }

  // 2. Get followers
  const followers = await Follow.find({ following: userId }).populate([
    { path: 'follower', select: 'firstName lastName headline photoUrl' },
  ]);

  return followers;
};

const getAllFollowing = async (userId: string) => {
  // 1. Check if the user exists and is active
  const user = await User.findById(userId);
  if (!user || user.isDeleted || user.status === 'blocked') {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or inactive');
  }

  // 2. Get following
  const following = await Follow.find({ follower: userId }).populate([
    { path: 'following', select: 'firstName lastName headline photoUrl' },
  ]);

  return following;
};

const checkedFollowUser = async (viewerId: string, targetUserId: string) => {
  // 1. Check if the user exists and is active
  const user = await User.findById(targetUserId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or inactive');
  }

  // 2. Count followers and following of the target user
  const [followingCount, followersCount] = await Promise.all([
    Follow.countDocuments({ follower: targetUserId }),
    Follow.countDocuments({ following: targetUserId }),
  ]);

  // 3. Check relationship
  const [isFollowing, isFollower] = await Promise.all([
    Follow.exists({ follower: viewerId, following: targetUserId }), // viewer → user
    Follow.exists({ follower: targetUserId, following: viewerId }), // user → viewer
  ]);

  return {
    followingCount,
    followersCount,
    following: !!isFollowing,
    follower: !!isFollower,
  };
};

export const FollowService = {
  followUser,
  unfollowUser,
  getAllFollowers,
  getAllFollowing,
  checkedFollowUser,
};
