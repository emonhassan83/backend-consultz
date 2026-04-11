import { createServer, Server } from 'http'
import app from './app'
import mongoose from 'mongoose'
import config from './app/config'
import { errorlogger, logger } from './app/utils/logger'
import { seeder } from './app/seeder/seed'
import colors from 'colors'
import { initializeCronJobs } from './app/utils/initializeCronJobs'
// import initializeSocketIO from './app/socket/socket.init'
import initializeSocketIO from './socket'

let server: Server
export const io = initializeSocketIO(createServer(app))

async function main() {
  try {
    await mongoose.connect(config.database_url as string)

    logger.info('Connected to database')

    // default task added
    await Promise.all([
      seeder.seedAdmin(),
      seeder.seedContents(),
      seeder.seedCategories(),
    ])

    // run the corn job
    initializeCronJobs()

    server = app.listen(Number(config.port), config.ip as string, () => {
      console.log(
        colors.italic.green.bold(
          `💫 Simple Server Listening on  http://${config?.ip}:${config.port} `,
        ),
      )
      logger.info(`app is listening on  http://${config?.ip}:${config.port}`)
    })

    io.listen(Number(config.socket_port))
    console.log(
      colors.yellow.bold(
        `⚡Socket.io running on  http://${config.ip}:${config.socket_port}`,
      ),
    )
    logger.info(
      `Socket is listening on http://${config.ip}:${config.socket_port}`,
    )

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
