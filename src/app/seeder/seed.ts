import config from '../config'
import { Category } from '../modules/category/category.model'
import { Contents } from '../modules/contents/contents.models'
import { USER_ROLE } from '../modules/user/user.constant'
import { User } from '../modules/user/user.model'
import { findAdmin } from '../utils/findAdmin'
import { categories } from '../utils/seedData'

const adminUser = {
  firstName: 'vincent',
  lastName: 'wong',
  email: 'admin@vincentwong.gmail.com',
  password: config.admin_pass,
  role: USER_ROLE.admin,
  contractNumber: '+876543345678',
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

// Function to seed Contents
const seedContents = async () => {
  const admin = await findAdmin()
  const existingContents = await Contents.countDocuments()

  if (existingContents === 0) {
    await Contents.create({
      aboutUs: '',
      termsAndConditions: '',
      privacyPolicy: '',
      paymentHoldDays: 0,
      consultationFee: 0,
      createdBy: admin?._id,
    })

    console.log('\n✅Default Contents seeded successfully!')
  }
}

const seedCategories = async () => {
  try {
    let seededCount = 0;

    for (const cat of categories) {
      // Normalize title for comparison (case-insensitive + trim)
      const normalizedTitle = cat.title.trim().toLowerCase();

      // Check if category already exists (case-insensitive)
      const exists = await Category.findOne({
        $expr: {
          $eq: [{ $toLower: '$title' }, normalizedTitle],
        },
      });

      if (!exists) {
        // Create only if not found
        await Category.create({ title: cat.title.trim() });
        seededCount++;
      }
    }

    if (seededCount > 0) {
      console.log(`\n✅ ${seededCount} new categories seeded successfully!`);
    } else {
      console.log('\nℹ️ All categories already exist. No new seeding needed.');
    }
  } catch (error) {
    console.error('❌ Category seeding failed:', error);
  }
};

export const seeder = {
  seedContents,
  seedAdmin,
  seedCategories
}
