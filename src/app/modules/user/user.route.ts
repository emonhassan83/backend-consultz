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
  UserControllers.changeUserNotify,
)

router.patch(
  '/change-status',
  auth(USER_ROLE.admin),
  zodValidationRequest(UserValidation.changeStatusValidationSchema),
  UserControllers.changeUserStatus,
)

router.patch(
  '/update-location',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  zodValidationRequest(UserValidation.updateLocationValidationSchema),
  UserControllers.updateLocation,
)

router.put(
  '/update-my-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  upload.single('image'),
  parseData(),
  UserControllers.updateMyProfile,
)

router.put(
  '/:id',
  auth(USER_ROLE.admin),
  upload.single('image'),
  parseData(),
  zodValidationRequest(UserValidation.updateValidationSchema),
  UserControllers.updateUserInfo,
)

router.delete(
  '/:id',
  auth(USER_ROLE.admin),
  UserControllers.deleteAUser,
)

router.get(
  '/my-profile',
  auth(USER_ROLE.admin, USER_ROLE.expert, USER_ROLE.consult),
  UserControllers.getMyProfile,
)

router.get('/business', auth(USER_ROLE.admin), UserControllers.getAllBusiness)

router.get('/', auth(USER_ROLE.admin), UserControllers.getAllUsers)

router.get(
  '/business/:id',
  auth(USER_ROLE.admin),
  UserControllers.getBusinessById,
)

router.get('/:id', auth(USER_ROLE.admin), UserControllers.getUserById)

export const UserRoutes = router
