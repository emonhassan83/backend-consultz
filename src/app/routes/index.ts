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
import { ChatRoutes } from '../modules/chat/chat.route'
import { MessagesRoutes } from '../modules/messages/messages.route'
import { uploadRouter } from '../modules/uploads/route'
import { BookingsRoutes } from '../modules/booking/booking.route'
import { BookingSlotsRoutes } from '../modules/bookingSlots/bookingSlots.route'
import { PaymentRoutes } from '../modules/payment/payment.route'
import { CardRoutes } from '../modules/card/card.route'
import { CategoriesRoutes } from '../modules/category/category.route'
import { StripeRoute } from '../modules/stripe/stripe.route'
import { WithdrawRoutes } from '../modules/withdraw/withdraw.route'
import { CallingRoutes } from '../modules/calling/calling.route'
import { MetaRoutes } from '../modules/meta/meta.route'
import { SupportRoutes } from '../modules/support/support.route'

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
    path: '/cards',
    route: CardRoutes,
  },
  {
    path: '/booking-slots',
    route: BookingSlotsRoutes,
  },
  {
    path: '/bookings',
    route: BookingsRoutes,
  },
  {
    path: '/calling',
    route: CallingRoutes,
  },
  {
    path: '/payments',
    route: PaymentRoutes,
  },
  {
    path: '/stripe',
    route: StripeRoute,
  },
  {
    path: '/withdraw',
    route: WithdrawRoutes,
  },
  {
    path: '/chats',
    route: ChatRoutes,
  },
  {
    path: '/messages',
    route: MessagesRoutes,
  },
  {
    path: '/uploads',
    route: uploadRouter,
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
  {
    path: '/supports',
    route: SupportRoutes,
  },
  {
    path: '/categories',
    route: CategoriesRoutes,
  },
  {
    path: '/meta',
    route: MetaRoutes,
  },
]

moduleRoutes.forEach((route) => router.use(route.path, route.route))

export default router
