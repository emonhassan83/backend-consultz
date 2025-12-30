import { Router } from 'express'
import { UserRoutes } from '../modules/user/user.route'
import { AuthRoutes } from '../modules/auth/auth.route'
import { otpRoutes } from '../modules/otp/otp.route'
import { NotificationRoutes } from '../modules/notification/notification.route'
import { contentsRoutes } from '../modules/contents/contents.route'
import { ConnectionRoutes } from '../modules/connection/connection.route'
import { BlockProfileRoutes } from '../modules/blockProfile/blockProfile.route'
import { FeedRoutes } from '../modules/feed/feed.route'
import { ContentMetaRoutes } from '../modules/contentMeta/contentMeta.route'
import { CommentsRoutes } from '../modules/comments/comments.route'
import { ReplyRoutes } from '../modules/reply/reply.route'
import { ReviewsRoutes } from '../modules/review/review.route'
import { ReportRoutes } from '../modules/report/report.route'

const router = Router()

const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  {
    path: '/otp',
    route: otpRoutes,
  },
  {
    path: '/connections',
    route: ConnectionRoutes,
  },
  {
    path: '/profile-block',
    route: BlockProfileRoutes,
  },
  {
    path: '/feeds',
    route: FeedRoutes,
  },
  {
    path: '/reports',
    route: ReportRoutes,
  },
  {
    path: '/content-meta',
    route: ContentMetaRoutes,
  },
  {
    path: '/comments',
    route: CommentsRoutes,
  },
  {
    path: '/reply',
    route: ReplyRoutes,
  },
  {
    path: '/reviews',
    route: ReviewsRoutes,
  },
  {
    path: '/notifications',
    route: NotificationRoutes,
  },
  {
    path: '/contents',
    route: contentsRoutes,
  },
]

moduleRoutes.forEach((route) => router.use(route.path, route.route))

export default router
