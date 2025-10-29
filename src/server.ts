import { createServer, Server } from 'http'
import app from './app'
import mongoose from 'mongoose'
import config from './app/config'
import { errorlogger, logger } from './app/utils/logger'
import initializeSocketIO from './socket'
import { seeder } from './app/seeder/seed'

let server: Server
export const io = initializeSocketIO(createServer(app))

async function main() {
  try {
    await mongoose.connect(config.database_url as string)

    logger.info('Connected to database')

    // default task added
    seeder.seedAdmin()
    // seeder.seedContents()
    // startSubscriptionCron();

    server = app.listen(Number(config.port), config.ip as string, () => {
      console.log(`app is listening on port ${config.port}`)
      logger.info(`app is listening on port ${config.port}`)
    })

    io.listen(Number(config.socket_port))
    console.log(`Socket is listening on port ${config.socket_port}`)
    logger.info(`Socket is listening on port ${config.socket_port}`)

    //@ts-ignore
    global.socketio = io
  } catch (err) {
    console.log(err)
    errorlogger.error(err)
  }
}

main()

process.on('unhandledRejection', (err) => {
  console.log(`😈 unahandledRejection is detected , shutting down ...`, err)
  errorlogger.error(err)
  if (server) {
    server.close(() => {
      process.exit(1)
    })
  }
  process.exit(1)
})

process.on('uncaughtException', () => {
  console.log(`😈 uncaughtException is detected , shutting down ...`)
  errorlogger.error('uncaughtException is detected')
  process.exit(1)
})
