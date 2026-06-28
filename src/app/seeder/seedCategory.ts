import mongoose from 'mongoose'
import config from '../config'
import { Category } from '../modules/category/category.model'
import { categories } from '../utils/seedData'

const seedCategories = async () => {
  try {
    // Step 1: check if category exist or not
    const existingCount = await Category.countDocuments()

    // if found any category then seed stop
    if (existingCount > 0) {
      console.log(
        `\nℹ️ ${existingCount} categories already exist in the database. Seeding skipped.`
      )
      return
    }

    // Step 2: if not found categories then seed categories
    const formattedCategories = categories.map(cat => ({
      title: cat.title.trim(),
      items: cat.items.map(item => item.trim()),
    }))

    const inserted = await Category.insertMany(formattedCategories)

    console.log(
      `\n✅ Seeding completed successfully! ${inserted.length} categories inserted.`
    )
  } catch (error) {
    console.error('❌ Category seeding failed:', error)
    process.exit(1)
  }
}

mongoose.connect(config.database_url as string)
  .then(() => {
    console.log('Connected to database')
    return seedCategories()
  })
  .then(() => {
    console.log('✅ Category seeding completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Category seeding failed:', error)
    process.exit(1)
  })
