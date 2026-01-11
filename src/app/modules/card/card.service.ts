import QueryBuilder from '../../builder/QueryBuilder'
import { ICard } from './card.interface'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Card } from './card.models'
import mongoose from 'mongoose'

const createCard = async (payload: ICard, userId: string) => {
  /* ============================
     1. Validate Author
  ============================ */
  const author = await User.findById(userId)
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Author not found!')
  }

  /* ============================
     2. Validate Expiry Date
  ============================ */
  const [month, year] = payload.expiryDate.split('/').map(Number)

  if (!month || !year || month < 1 || month > 12) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid expiry date format')
  }

  const expiry = new Date(2000 + year, month) // end of expiry month
  const now = new Date()

  if (expiry <= now) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card is expired')
  }

  /* ============================
     3. Check Existing Card
  ============================ */
  const existingCard = await Card.findOne({
    author: userId,
    cardNumber: payload.cardNumber,
    isDeleted: false,
  })

  if (existingCard) {
    // Check if existing card is expired
    const [exMonth, exYear] = existingCard.expiryDate.split('/').map(Number)

    const existingExpiry = new Date(2000 + exYear, exMonth)

    if (existingExpiry <= now) {
      // Soft delete expired card
      await Card.findByIdAndUpdate(existingCard._id, {
        isDeleted: true,
      })
    } else {
      throw new AppError(httpStatus.CONFLICT, 'Card already exists')
    }
  }

  /* ============================
     4. Create Card
  ============================ */
  payload.author = new mongoose.Types.ObjectId(userId)

  const card = await Card.create(payload)
  if (!card) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card creation failed!')
  }

  return card
}

const getAllCard = async (query: Record<string, any>) => {
  const CardModel = new QueryBuilder(
    Card.find({ isDeleted: false }).populate([
      { path: 'author', select: 'firstName lastName photoUrl email' },
    ]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()

  const cards: any = await CardModel?.modelQuery
  const meta = await CardModel?.countTotal()

  const data = cards.map((card: any) => ({
    ...card.toObject(),
    status: getCardStatus(card.expiryDate),
  }))

  return { data, meta }
}

const getCardById = async (id: string) => {
  const card = await Card.findById(id).populate([
    { path: 'author', select: 'firstName lastName photoUrl email' },
  ])
  if (!card || card.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card history not found!')
  }

  return {
    ...card.toObject(),
    status: getCardStatus(card.expiryDate),
  }
}

const updateCard = async (id: string, payload: Partial<ICard>) => {
  const card = await Card.findById(id)
  if (!card || card?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card not found!')
  }

  const result = await Card.findByIdAndUpdate(id, payload, {
    new: true,
  })
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card updated failed !')
  }

  return result
}

const deleteCard = async (id: string) => {
  const card = await Card.findById(id)
  if (!card || card?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card not found!')
  }

  const result = await Card.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  )
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card history deleted failed !')
  }

  return result
}

export const CardService = {
  createCard,
  getAllCard,
  getCardById,
  updateCard,
  deleteCard,
}
