import mongoose from 'mongoose'
import config from '../config'
import { USER_ROLE } from '../modules/user/user.constant'
import { User } from '../modules/user/user.model'

const adminUser = {
  firstName: 'vincent',
  lastName: 'wong',
  email: 'vincentnetworkpropertybuyers@gmail.com',
  password: config.admin_pass as string,
  role: USER_ROLE.admin,
  contractNumber: '+876543345678',
  verification: {
    otp: '0',
    status: true,
  },
  expireAt: null as any,
}

const seedAdmin = async () => {
  try {
    // Check if admin already exists
    const isAdminExists = await User.findOne({ role: USER_ROLE.admin })

    if (!isAdminExists) {
      await User.create(adminUser)
      console.log('\n✅ Admin User Seeded Successfully!')
    } else {
      console.log('\nℹ️ Admin user already exists. Seeding skipped.')
    }
  } catch (error) {
    console.error('❌ Admin seeding failed:', error)
    process.exit(1)
  }
}

mongoose.connect(config.database_url as string)
  .then(() => {
    console.log('Connected to database')
    return seedAdmin()
  })
  .then(() => {
    console.log('✅ Admin seeding completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Admin seeding failed:', error)
    process.exit(1)
  })
