import mongoose from 'mongoose'
import config from '../config'
import { Contents } from '../modules/contents/contents.models'

const contentSeeder = async () => {
  const contentsData = [
    // General settings
    { key: 'paymentHoldDays', value: 7 },
    { key: 'platformFeePercentage', value: 20 },
    { key: 'supportContract', value: '+447575640688' },
    { key: 'supportEmail', value: 'info@consultz.com' },

    // Terms & Conditions
    { key: 'termsAndConditions', value: 'This is trams and condition' },
    { key: 'privacyAndPolicy', value: 'This is privacy and policy' },
  ]

  const bulkOps = contentsData.map((content) => ({
    updateOne: {
      filter: { key: content.key },
      update: { $setOnInsert: content },
      upsert: true,
    },
  }))

  await Contents.bulkWrite(bulkOps)
  console.log('✅ Contents seeded successfully')
}

mongoose.connect(config.database_url as string)
  .then(() => {
    console.log('Connected to database')
    return contentSeeder()
  })
  .then(() => {
    console.log('✅ Content seeding completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Content seeding failed:', error)
    process.exit(1)
  })