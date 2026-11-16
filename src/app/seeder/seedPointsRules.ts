import mongoose from 'mongoose'
import config from '../config'
import { PointsService } from '../modules/points/points.service'

const seedPointsRules = async () => {
  const rules = await PointsService.seedDefaultRules()
  console.log(`✅ Points rules seeded: ${rules.length} rules`)
}

mongoose
  .connect(config.database_url as string)
  .then(() => {
    console.log('Connected to database')
    return seedPointsRules()
  })
  .then(() => {
    console.log('✅ Points rules seeding completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Points rules seeding failed:', error)
    process.exit(1)
  })
