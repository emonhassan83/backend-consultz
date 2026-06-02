import QueryBuilder from '../../builder/QueryBuilder'
import { BlockProfile } from './blockProfile.models'
import { User } from '../user/user.model'
import httpStatus from 'http-status'
import { USER_STATUS } from '../user/user.constant'
import AppError from '../../errors/AppError'

const blockUserProfile = async (blockerId: string, blockedId: string) => {
  if (blockerId === blockedId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot block yourself')
  }

  // Check if blocker user exists
  const blocker = await User.findById(blockerId)
  if (!blocker || blocker.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blocker user not found')
  }
  if (blocker.status === USER_STATUS.blocked) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are blocked from performing this action',
    )
  }

  // Check if blocked user exists
  const blocked = await User.findById(blockedId)
  if (!blocked || blocked.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User to block not found')
  }

  if (blocked.status === USER_STATUS.blocked) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This user is already blocked from the system',
    )
  }

  // Check if already blocked
  const alreadyBlocked = await BlockProfile.findOne({
    blocker: blockerId,
    blocked: blockedId,
  })

  if (alreadyBlocked) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User is already blocked')
  }

  // Create block entry
  const block = await BlockProfile.create({
    blocker: blockerId,
    blocked: blockedId,
  })

  return block
}

const unblockProfile = async (blockerId: string, blockedId: string) => {
  if (blockerId === blockedId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid unblock request')
  }

  const blocker = await User.findById(blockerId)
  if (!blocker || blocker.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blocker user not found')
  }

  const blocked = await User.findById(blockedId)
  if (!blocked || blocked.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blocked user not found')
  }

  const unblock = await BlockProfile.findOneAndDelete({
    blocker: blockerId,
    blocked: blockedId,
  })

  if (!unblock) {
    throw new AppError(httpStatus.NOT_FOUND, 'Block entry not found')
  }

  return unblock
}

const getAllBlockProfile = async (query: Record<string, any>) => {
  const blockProfileModel = new QueryBuilder(
    BlockProfile.find().populate([
      { path: 'blocked', select: 'firstName lastName expertise photoUrl' },
    ]),
    query,
  )
    .filter()
    .paginate()
    .sort()

  const blockDocs: any = await blockProfileModel.modelQuery
  const meta = await blockProfileModel.countTotal()

  // 3. Transform response (IMPORTANT PART)
  const data = blockDocs.map((doc: any) => doc.blocked).filter(Boolean)

  return { data, meta }
}

const getBlockProfileById = async (id: string) => {
  const result = await BlockProfile.findById(id).populate([
    { path: 'blocked', select: 'firstName lastName expertise photoUrl' },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Profile block not found!')
  }

  return result
}

export const BlockProfileService = {
  blockUserProfile,
  getAllBlockProfile,
  getBlockProfileById,
  unblockProfile,
}
