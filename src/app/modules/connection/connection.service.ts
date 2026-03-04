import { Follow } from './connection.models';
import httpStatus from 'http-status';
import { sendUserFollowNotify } from './connection.utils';
import { User } from '../user/user.model';
import AppError from '../../errors/AppError';
import QueryBuilder from '../../builder/QueryBuilder';

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
  await sendUserFollowNotify(followerId, followingId, follow);

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

  return result;
};

// src/modules/follow/follow.service.ts

const getAllFollowers = async (targetUserId: string, currentUserId: string, query: Record<string, unknown>) => {
  const targetUser = await User.findById(targetUserId);
  if (!targetUser || targetUser.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or inactive');
  }

  // Get all follower IDs
  const followDocs = await Follow.find({ following: targetUserId }).select('follower');
  const followerIds = followDocs.map(doc => doc.follower);

  // Build base query
  const userQuery = new QueryBuilder(
    User.find({
      _id: { $in: followerIds },
    }).select('firstName lastName headline photoUrl'),
    query
  )
    .search(['firstName', 'lastName'])
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      createdAt: -1,
    })
    .paginate()
    .fields();

  let result = await userQuery.modelQuery;

  // Add isFollowing field: check if current user follows each follower
  const currentFollowings = await Follow.find({
    follower: currentUserId,
    following: { $in: followerIds },
  }).select('following');

  const followingSet = new Set(currentFollowings.map(f => f.following.toString()));

  // Map result with isFollowing
  // @ts-ignore
  result = result.map(userDoc => ({
    ...userDoc.toObject(),
    isFollowing: followingSet.has(userDoc._id.toString()),
  }));

  const meta = await userQuery.countTotal();

  return { meta, result };
};

const getAllFollowing = async (targetUserId: string, currentUserId: string, query: Record<string, unknown>) => {
  const targetUser = await User.findById(targetUserId);
  if (!targetUser || targetUser.isDeleted || targetUser.status === 'blocked') {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or inactive');
  }

  // Get all following IDs
  const followDocs = await Follow.find({ follower: targetUserId }).select('following');
  const followingIds = followDocs.map(doc => doc.following);

  // Build base query
  const userQuery = new QueryBuilder(
    User.find({
      _id: { $in: followingIds },
    }).select('firstName lastName headline photoUrl'),
    query
  )
    .search(['firstName', 'lastName'])
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      createdAt: -1,
    })
    .paginate()
    .fields();

  let result = await userQuery.modelQuery;

  // Add isFollowing field: check if current user follows each followed user
  const currentFollowings = await Follow.find({
    follower: currentUserId,
    following: { $in: followingIds },
  }).select('following');

  const followingSet = new Set(currentFollowings.map(f => f.following.toString()));

  // Map result with isFollowing
  // @ts-ignore
  result = result.map(userDoc => ({
    ...userDoc.toObject(),
    isFollowing: followingSet.has(userDoc._id.toString()),
  }));

  const meta = await userQuery.countTotal();

  return { meta, result };
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
