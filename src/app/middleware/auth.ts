import { NextFunction, Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config'
import { User } from '../modules/user/user.model'
import { TUserRole } from '../modules/user/user.constant'

const auth = (...requiredRoles: TUserRole[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization
    //* checking if the token is missing
    if (!token) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized Access')
    }

    //* checking if the given token is valid
    let decoded
    try {
      decoded = jwt.verify(
        token,
        config.jwt_access_secret as string,
      ) as JwtPayload
    } catch (error) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized Access!')
    }
    const { role, email, iat } = decoded

    //* checking if the user is exist
    const user = await User.isUserExistsByEmail(email)
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
    }
    //* checking if the user is already deleted
    const isDeleted = user?.isDeleted
    if (isDeleted) {
      throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted !')
    }

    //* checking if the user is blocked
    const userStatus = user?.status
    if (userStatus === 'blocked') {
      throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked !!')
    }

    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!')
    }
    req.user = decoded as JwtPayload
    

    next()
  })
}

export default auth
