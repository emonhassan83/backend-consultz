import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import httpStatus from 'http-status'
import getUserDetailsFromToken from './app/utils/vaildateUserFromToken'
import AppError from './app/errors/AppError'

const initializeSocketIO = (server: HttpServer) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      credentials: true,
    },
  })

  // Online users
  const onlineUser = new Set()

  io.on('connection', async (socket) => {
    console.log('connected', socket?.id)

    try {
      //----------------------user token get from front end-------------------------//
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.token
      //----------------------check Token and return user details-------------------------//
      let user: any
      try {
        user = await getUserDetailsFromToken(token)
        if (!user) {
          throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid token')
        }
      } catch (error) {
        console.log(error)
        return
      }

      socket.join(user?._id?.toString())

      //----------------------user id set in online array-------------------------//
      onlineUser.add(user?._id?.toString())

      socket.on('check', (data, callback) => {
        callback({ success: true })
      })

      //-----------------------Disconnect------------------------//
      socket.on('disconnect', () => {
        onlineUser.delete(user?._id?.toString())
        io.emit('onlineUser', Array.from(onlineUser))
        console.log('disconnect user ', socket.id)
      })
    } catch (error) {
      console.error('-- socket.io connection error --', error)
    }
  })

  return io
}

export default initializeSocketIO
