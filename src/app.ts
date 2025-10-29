import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import globalErrorHandler from './app/middleware/globalErrorHandler'
import notFound from './app/middleware/notFound'
import router from './app/routes'

const app: Application = express()

//* parser
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  }),
)
app.use(cookieParser())

// application routes
app.use('/api/v1', router)

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Consult Expert app is running!',
    status: 'success',
    timestamp: new Date().toISOString(),
  })
})

// use global error handler middleware
// @ts-ignore
app.use(globalErrorHandler)

// Not found middleware
// @ts-ignore
app.use(notFound)

export default app
