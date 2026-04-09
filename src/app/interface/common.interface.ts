export interface UploadedFiles {
  image?: Express.Multer.File[];
  cover?: Express.Multer.File[];
  images?: Express.Multer.File[];
  frontSide?: Express.Multer.File[];
  backSide?: Express.Multer.File[];
  videos?: Express.Multer.File[];
  documents?: Express.Multer.File[];
}
export const USER_ROLE = {
  admin: 'admin',
  expert: 'expert',
  consult: 'consult',
} as const

export type USER_ROLE = typeof USER_ROLE[keyof typeof USER_ROLE]