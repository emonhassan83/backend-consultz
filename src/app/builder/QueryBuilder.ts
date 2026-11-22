import { Query } from 'mongoose'

// Secrets that must never be returned through `?fields=`, on any model
const NEVER_SELECTABLE_FIELDS = new Set([
  'password',
  'verification',
  'verification.otp',
  'passwordChangedAt',
  'fcmToken',
  'voipToken',
])

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>
  public query: Record<string, unknown>

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery
    this.query = query
  }

  search(searchableFields: string[]) {
    const searchTerm = this.query?.searchTerm as string | undefined
    if (searchTerm) {
      const terms: string[] = searchTerm.split(' ') // এখন split কাজ করবে
      this.modelQuery = this.modelQuery.find({
        $or: searchableFields.flatMap((field: string) =>
          terms.map((term: string) => ({
            [field]: { $regex: term, $options: 'i' },
          })),
        ),
      })
    }
    return this
  }

  filter() {
    const queryObj = { ...this.query } // copy

    // Filtering
    const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields']

    excludeFields.forEach((el) => delete queryObj[el])

    this.modelQuery = this.modelQuery.find(queryObj as any)

    return this
  }

  sort() {
    const sort =
      (this?.query?.sort as string)?.split(',')?.join(' ') || '-createdAt'
    this.modelQuery = this.modelQuery.sort(sort as string)

    return this
  }

  // 🔥 NEW METHOD
  sortByCustom(customSort: Record<string, 1 | -1>) {
    if (this.query?.sort) {
      const sort = (this.query.sort as string)?.split(',')?.join(' ')
      this.modelQuery = this.modelQuery.sort(sort)
      return this
    }

    this.modelQuery = this.modelQuery.sort(customSort)
    return this
  }

  sortReviews() {
    const sortQuery = (this.query?.sort as string)?.toLowerCase()?.trim()

    let sortOption: string | Record<string, 1 | -1> = '-createdAt' // default: latest

    if (sortQuery) {
      switch (sortQuery) {
        case 'latest':
          sortOption = '-createdAt'
          break
        case 'highest':
          sortOption = '-rating'
          break
        case 'lowest':
          sortOption = 'rating'
          break
        default:
          sortOption = sortQuery.split(',').join(' ')
      }
    }

    this.modelQuery = this.modelQuery.sort(sortOption)
    return this
  }

  paginate() {
    const page = Number(this?.query?.page) || 1
    const limit = Number(this?.query?.limit) || 10
    const skip = (page - 1) * limit

    this.modelQuery = this.modelQuery.skip(skip).limit(limit)

    return this
  }

  fields() {
    const raw = typeof this?.query?.fields === 'string' ? this.query.fields : ''
    let requested = raw
      .split(',')
      .map((f) => f.trim())
      .filter(
        (f) =>
          f &&
          !f.startsWith('+') && // never force-select hidden (select:false) fields
          !NEVER_SELECTABLE_FIELDS.has(f.replace(/^-/, '')),
      )

    // Mongoose merges this select into any earlier inclusive .select(), so
    // `?fields=password,dob` would otherwise ADD fields the service never
    // meant to expose. When the service already picked fields, only allow
    // narrowing to a subset of them.
    const existing = this.modelQuery.projection() as
      | Record<string, unknown>
      | undefined
    const isInclusive =
      !!existing &&
      Object.values(existing).some((v) => v === 1 || v === true)
    if (isInclusive) {
      requested = requested.filter((f) => !f.startsWith('-') && f in existing)
    }

    this.modelQuery = this.modelQuery.select(
      requested.length ? requested.join(' ') : '-__v',
    )
    return this
  }

  async countTotal() {
    const totalQueries = this.modelQuery.getFilter()
    const total = await this.modelQuery.model.countDocuments(totalQueries)
    const page = Number(this?.query?.page) || 1
    const limit = Number(this?.query?.limit) || 10
    const totalPage = Math.ceil(total / limit)

    return {
      page,
      limit,
      total,
      totalPage,
    }
  }
}

export default QueryBuilder
