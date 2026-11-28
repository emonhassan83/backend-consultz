#!/usr/bin/env bash
# Starts the API with external services mocked. All config vars are set
# explicitly so nothing falls back to the real .env.
# Usage: loadtest/start-server.sh [dist|ts]   (default dist)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-dist}"
cd "$ROOT" || exit 1

export NODE_ENV=production
export PORT=5099
export SOCKET_PORT=5098
export IP=127.0.0.1
export SERVER_URL=http://127.0.0.1:5099/api/v1
export APP_URL=http://127.0.0.1.invalid/app
export CLIENT_URL=http://127.0.0.1.invalid/dashboard
export DATABASE_URL='mongodb://localhost:27098/consultz_load?replicaSet=rs0&directConnection=true'
export BCRYPT_SALT_ROUNDS=12
export JWT_ACCESS_SECRET=loadtest_access_secret_not_real
export JWT_REFRESH_SECRET=loadtest_refresh_secret_not_real
export JWT_ACCESS_EXPIRE_IN=7d
export JWT_REFRESH_EXPIRE_IN=30d
export ADMIN_PASS=Passw0rd!
export BREVO_SMTP_LOGIN=loadtest-mock
export BREVO_SMTP_KEY=loadtest-mock-key
export EMAIL_FROM_ADDRESS=loadtest@example.invalid
export EMAIL_FROM_NAME=LoadTest
export ADMIN_NOTIFY_EMAIL=admin-loadtest@example.invalid
export EMAIL=loadtest@example.invalid
export APP_PASS=loadtest-mock
export STRIPE_API_KEY=pk_test_fake
export STRIPE_API_SECRET=sk_test_fake
export PAYMENT_SUCCESS_URL=http://127.0.0.1.invalid/success
export PAYMENT_CANCEL_URL=http://127.0.0.1.invalid/cancel
export RESET_PASS_LINK=http://127.0.0.1.invalid/reset
export S3_BUCKET_ACCESS_KEY=fake
export S3_BUCKET_SECRET_ACCESS_KEY=fake
export AWS_REGION=us-east-1
export AWS_BUCKET_NAME=fake-bucket
export SPACES_API=http://127.0.0.1.invalid/spaces
export S3_API=http://127.0.0.1.invalid/s3
export S3_BASE_URL=http://127.0.0.1.invalid/bucket
export TWILIO_ACCOUNT_SID=ACfakefakefakefakefakefakefakefake
export TWILIO_AUTH_TOKEN=fake
export TWILIO_PHONE_NUMBER=+15005550006
export AGORA_APP_ID=fakeagoraappid
export AGORA_APP_CERTIFICATE=fakeagoracertificate
export AGORA_TOKEN_EXPIRE=3600
export FIREBASE_PROJECT_ID=fake-project
export FIREBASE_PRIVATE_KEY_ID=fake
export FIREBASE_PRIVATE_KEY='fake'
export FIREBASE_CLIENT_EMAIL=fake@fake-project.iam.gserviceaccount.com
export FIREBASE_CLIENT_ID=fake
export FIREBASE_CLIENT_CERT_URL=http://127.0.0.1.invalid/cert
export APNS_KEY_ID=fake
export APNS_TEAM_ID=fake
export APNS_BUNDLE_ID=com.example.loadtest
export APNS_PRODUCTION=false
export APIFREAKS_KEY=fake

mkdir -p loadtest/results
if [ "$MODE" = "ts" ]; then
  exec node -r ts-node/register/transpile-only -r ./loadtest/mocks.js src/server.ts >> loadtest/results/server.log 2>&1
else
  exec node -r ./loadtest/mocks.js dist/server.js >> loadtest/results/server.log 2>&1
fi
