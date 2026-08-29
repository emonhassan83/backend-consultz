import express from 'express'
import zodValidationRequest from '../../middleware/validateRequest'
import { UserValidation } from './user.validation'
import { UserControllers } from './user.controller'
import auth from '../../middleware/auth'
import { USER_ROLE } from './user.constant'
import parseData from '../../middleware/parseData'
import multer, { memoryStorage } from 'multer'

const router = express.Router()
const storage = memoryStorage()
const upload = multer({ storage })

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
  '/:id',
  auth(USER_ROLE.admin),
  UserControllers.deleteUserProfile,
)
router.delete(
  '/delete-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.deleteMyProfile,
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
