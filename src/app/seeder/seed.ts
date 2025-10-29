import config from '../config'
import { USER_ROLE } from '../modules/user/user.constant'
import { User } from '../modules/user/user.model'
import { findAdmin } from '../utils/findAdmin'

const adminUser = {
  name: 'vincentwong',
  email: 'admin@vincentwong.gmail.com',
  password: config.admin_pass,
  role: USER_ROLE.admin,
  contractNumber: "+876543345678",
  verification: {
    otp: '0',
    status: true,
  },
  expireAt: null,
}

// Function to seed admin
const seedAdmin = async () => {
  //when database is connected, we will check is there any user who is admin
  const isAdminExits = await User.findOne({ role: USER_ROLE.admin })

  if (!isAdminExits) {
    await User.create(adminUser)
    console.log('\n✅ Admin User Seeded Successfully!')
  }
}

// // Function to seed Contents
// const seedContents = async () => {
//   const admin = await findAdmin()
//   const existingContents = await Contents.countDocuments()

//   if (existingContents === 0) {
//     await Contents.create({
//       aboutUs: '',
//       termsAndConditions: '',
//       privacyPolicy: '',
//       supports: '',
//       faq: '',
//       maxMembers: 3,
//       createdBy: admin?._id,
//     })

//     console.log('\n✅Default Contents seeded successfully!')
//   }
// }

export const seeder = {
  // seedContents,
  seedAdmin,
}
