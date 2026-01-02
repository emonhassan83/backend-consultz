import httpStatus from 'http-status'
import { uploadManyToS3, uploadToS3 } from '../../utils/s3'
import AppError from '../../errors/AppError'

const multiple = async (files: any) => {
  let fileArray: any[] = []

  // ✅ Normalize structure (handle multiple upload formats)
  if (Array.isArray(files)) {
    fileArray = files
  } else if (files?.files && Array.isArray(files.files)) {
    fileArray = files.files
  } else if (typeof files === 'object') {
    Object.values(files).forEach((arr: any) => {
      if (Array.isArray(arr)) fileArray.push(...arr)
    })
  }

  if (!fileArray.length) {
    return []
  }

  // ✅ Filter only images & videos
  const allowedFiles = fileArray.filter(
    (file) =>
      file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'),
  )

  if (!allowedFiles.length) {
    throw new Error('Only image and video files are allowed!')
  }

  // ✅ Prepare upload list
  const uploadItems = allowedFiles.map((file: any) => ({
    file,
    path: file.mimetype.startsWith('image/') ? 'images' : 'videos',
  }))

  // ✅ Upload all in one go
  const uploadedFiles = await uploadManyToS3(uploadItems)

  // ✅ Format unified response [{ url, size }]
  const result = uploadedFiles.map((item: any, index: number) => {
    const originalFile = allowedFiles[index]
    const sizeInMB = Number((originalFile.size / (1024 * 1024)).toFixed(4))
    return {
      url: item.url,
      size: sizeInMB,
    }
  })

  return result
}

const single = async (file: any) => {
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'File is required')
  }
  const result = await uploadToS3({
    file,
    fileName: `images/${Math.floor(100000 + Math.random() * 900000)}`,
  })
  const fileSizeInMB = Number((file.size / (1024 * 1024)).toFixed(4))

  return {
    url: result,
    size: fileSizeInMB,
  }
}

const uploadService = { multiple, single }
export default uploadService
