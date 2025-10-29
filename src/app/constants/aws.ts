import { S3Client } from '@aws-sdk/client-s3'
import config from '../config'

export const s3Client = new S3Client({
  endpoint: config.aws.endpoint,
  region: `${config.aws.region}`,
  credentials: {
    accessKeyId: `${config.aws.accessKeyId}`,
    secretAccessKey: `${config.aws.secretAccessKey}`,
  },
})
