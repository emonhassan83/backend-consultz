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
      paymentHoldDays: 30,
      consultationFee: 12,
      createdBy: admin?._id,
    })

    console.log('\n✅Default Contents seeded successfully!')
  }
}

const seedCategories = async () => {
  try {
  // Step 1: check if category exist or not
    const existingCount = await Category.countDocuments();

    // if found any category then seed stop
    if (existingCount > 0) {
      console.log(
        `\nℹ️ ${existingCount} categories already exist in the database. Seeding skipped.`
      );
      return;
    }

    // Step 2: if not found categories then seed categories
    const formattedCategories = categories.map(cat => ({
      title: cat.title.trim(),
      items: cat.items.map(item => item.trim()),
    }));

    const inserted = await Category.insertMany(formattedCategories);

    console.log(
      `\n✅ Seeding completed successfully! ${inserted.length} categories inserted.`
    );
  } catch (error) {
    console.error('❌ Category seeding failed:', error);
  }
};

export const seeder = {
  seedContents,
  seedAdmin,
  seedCategories
}
