import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join((process.cwd(), '.env')) })

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  ip: process.env.IP,
  socket_port: process.env.SOCKET_PORT,
  client_url: process.env.CLIENT_URL,
  app_url: process.env.APP_URL,
  server_url: process.env.SERVER_URL,
  database_url: process.env.DATABASE_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRE_IN,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRE_IN,
  reset_pass_link: process.env.RESET_PASS_LINK,
    firebase: {
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  },
  emailSender: {
    email: process.env.EMAIL,
    app_pass: process.env.APP_PASS,
  },
  admin_pass: process.env.ADMIN_PASS,
  stripe: {
    stripe_api_key: process.env.STRIPE_API_KEY,
    stripe_api_secret: process.env.STRIPE_API_SECRET,
  },
  payment_success_url: process.env.PAYMENT_SUCCESS_URL,
  payment_cancel_url: process.env.PAYMENT_CANCEL_URL,
   aws: {
    accessKeyId: process.env.S3_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
    s3BaseUrl: process.env.S3_BASE_URL,
    s3_api: process.env.S3_API,
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_BUCKET_NAME,
    endpoint: process.env.SPACES_API,  
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },
  agora: {
    appId: process.env.AGORA_APP_ID,
    appCertificate: process.env.AGORA_APP_CERTIFICATE,
    tokenExpire: process.env.AGORA_TOKEN_EXPIRE
  },
}
