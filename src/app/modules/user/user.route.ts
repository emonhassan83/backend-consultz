import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import { UserValidation } from './user.validation'
import { UserControllers } from './user.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from './user.constant'
import parseData from '../../middleware/parseData'
import multer, { memoryStorage } from 'multer'
import httpStatus from 'http-status'
import { NextFunction, Request, Response } from 'express'
import AppError from '../../errors/AppError'
import { INTRO_VIDEO_MAX_MB, INTRO_VIDEO_MAX_SECONDS } from './user.constant'
import {
  getIntroVideoFileError,
  INTRO_VIDEO_TOO_LARGE_MESSAGE,
} from './user.utils'

const router = express.Router()
const storage = memoryStorage()
const upload = multer({ storage })

// Intro video (#31): size and type are checked while the file streams in
const introVideoMulter = multer({
  storage,
  limits: { fileSize: INTRO_VIDEO_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const error = getIntroVideoFileError(file.mimetype)
    if (error) return cb(new AppError(httpStatus.BAD_REQUEST, error))
    cb(null, true)
  },
}).single('video')

const introVideoUpload = (req: Request, res: Response, next: NextFunction) => {
  introVideoMulter(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(httpStatus.REQUEST_ENTITY_TOO_LARGE, INTRO_VIDEO_TOO_LARGE_MESSAGE, '', {
          maxSizeMB: INTRO_VIDEO_MAX_MB,
          maxDurationSeconds: INTRO_VIDEO_MAX_SECONDS,
        }),
      )
    }
    next(err)
  })
}

router.post(
  '/register',
  zodValidationRequest(UserValidation.createValidationSchema),
  UserControllers.registerUser,
)

router.patch(
  '/change-notify',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.updateNotifySettingsValidation),
  UserControllers.changeUserNotify,
)

router.patch(
  '/complete-onboarding',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.completeOnboardingValidationSchema),
  UserControllers.completeOnboarding,
)

// Email change with OTP to the new address (#26)
router.post(
  '/change-email/request',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.changeEmailRequestValidationSchema),
  UserControllers.requestEmailChange,
)

router.post(
  '/change-email/verify',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.changeEmailVerifyValidationSchema),
  UserControllers.verifyEmailChange,
)

// Expert intro video (#31): upload again to replace
router.put(
  '/intro-video',
  auth(USER_ROLE.expert),
  introVideoUpload,
  UserControllers.uploadIntroVideo,
)

router.delete(
  '/intro-video',
  auth(USER_ROLE.expert),
  UserControllers.removeIntroVideo,
)

router.patch(
  '/use-referral-code',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.useReferralCodeValidationSchema),
  UserControllers.useReferralCode,
)

router.post(
  '/:userId/points-adjustment',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.adjustPointsValidationSchema),
  UserControllers.adjustUserPoints,
)

// Admin corrects a user's email (#67)
router.patch(
  '/:id/email',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.adminUpdateEmailValidationSchema),
  UserControllers.adminUpdateUserEmail,
)

// Admin corrects a user's phone number (#67)
router.patch(
  '/:id/phone',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.adminUpdatePhoneValidationSchema),
  UserControllers.adminUpdateUserPhone,
)

router.patch(
  '/change-status',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.changeStatusValidationSchema),
  UserControllers.changeUserStatus,
)

router.put(
  '/update-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  parseData(),
  UserControllers.updateMyProfile,
)

// Update VAT Info
router.put(
  '/vat-info',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.updateVatInfoValidationSchema),
  UserControllers.updateVatInfo,
)

router.delete(
  '/delete-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.deleteMyProfile,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.deleteUserProfileValidationSchema),
  UserControllers.deleteUserProfile,
)

router.get(
  '/experts',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getAllExperts,
)

router.get(
  '/investment-experts',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getInvestmentExperts,
)

// Public Routes (No Authentication)
router.get('/public/interest-experts', UserControllers.getPublicInterestExperts)
router.get('/public/property-experts', UserControllers.getPublicPropertyExperts)
router.get('/public/top-experts', UserControllers.getPublicTopExperts)

router.get(
  '/interest-experts',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getInterestExpert,
)

router.get(
  '/property-experts',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getPropertyExperts,
)

router.get(
  '/top-experts',
  auth(USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getTopExperts,
)

router.get(
  '/my-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getMyProfile,
)

router.get('/', auth(USER_ROLE.admin), UserControllers.getAllUsers)

router.get(
  '/:id',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getUserById,
)

export const UserRoutes = router
