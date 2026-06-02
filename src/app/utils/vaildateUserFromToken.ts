import * as jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import config from '../config'
import AppError from '../errors/AppError'
import { User } from '../modules/user/user.model'

const getUserDetailsFromToken = async (token: string) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'you are not authorized!')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decode: any = await jwt.verify(
    token,
    config.jwt_access_secret as string,
  )
  const user = await User.findById(decode._id).select('-password')
  return user
}

export default getUserDetailsFromToken
