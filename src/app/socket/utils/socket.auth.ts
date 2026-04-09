import jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import config from '../../config'
import { TSocketUser } from '../interface/socket.interface'
import { Socket } from 'socket.io'
import AppError from '../../errors/AppError'

export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.token
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'you are not authorized!')
  }

  try {
    const decoded = jwt.verify(
      token,
      config.jwt_access_secret as string,
    ) as TSocketUser

    // @ts-ignore
    socket.auth = { _id: decoded.id, email: decoded.email, role: decoded.role }
    next()
  } catch (err: unknown) {
    console.error(err)
    next(new AppError(httpStatus.UNAUTHORIZED, 'you are not authorized!'))
  }
}
