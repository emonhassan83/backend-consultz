import { TUser } from '../modules/user/user.interface'
import { User } from '../modules/user/user.model'

export const findAdmin = async (): Promise<TUser | null> => {
  const admin = await User.findOne({ role: 'admin' })
  return admin ? admin : null
}
