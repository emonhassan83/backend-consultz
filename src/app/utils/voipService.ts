import { connect, type ClientHttp2Session } from 'node:http2'
import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'
import config from '../config'
import { ObjectId } from 'mongoose'

type TVoIPPushResult = {
  success: boolean
  reason?: string
}

type TAPNsResponse = {
  statusCode: number
  body: string
}

const apnsPrivateKey = fs.readFileSync(
  path.join(__dirname, '../../../certs', `AuthKey_${config.apns.keyId}.p8`),
)
const providerTokenRefreshInterval = 50 * 60 * 1000
let providerToken: string | undefined
let providerTokenIssuedAt = 0
let apnsSession: ClientHttp2Session | undefined

const getProviderToken = () => {
  if (!config.apns.keyId || !config.apns.teamId) {
    throw new Error('APNS_KEY_ID and APNS_TEAM_ID must be configured')
  }

  if (
    !providerToken ||
    Date.now() - providerTokenIssuedAt >= providerTokenRefreshInterval
  ) {
    providerToken = jwt.sign({}, apnsPrivateKey, {
      algorithm: 'ES256',
      keyid: config.apns.keyId,
      issuer: config.apns.teamId,
    })
    providerTokenIssuedAt = Date.now()
  }

  return providerToken
}

const getApnsSession = () => {
  if (apnsSession && !apnsSession.destroyed && !apnsSession.closed) {
    return apnsSession
  }

  const session = connect(
    config.apns.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com',
  )
  apnsSession = session
  session.on('close', () => {
    if (apnsSession === session) apnsSession = undefined
  })
  session.on('error', (error) => {
    if (apnsSession === session) apnsSession = undefined
    console.error('[VoIP Push] APNs session error:', error.message)
  })

  return session
}

const sendApnsRequest = (
  voipToken: string,
  topic: string,
  expiration: number,
  payload: Record<string, unknown>,
): Promise<TAPNsResponse> =>
  new Promise((resolve, reject) => {
    const session = getApnsSession()
    const request = session.request({
      ':method': 'POST',
      ':path': `/3/device/${encodeURIComponent(voipToken)}`,
      authorization: `bearer ${getProviderToken()}`,
      'apns-expiration': expiration,
      'apns-priority': '10',
      'apns-push-type': 'voip',
      'apns-topic': topic,
      'content-type': 'application/json',
    })
    let settled = false
    let statusCode: number | undefined
    let body = ''
    let timeout: NodeJS.Timeout

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }

    request.on('error', fail)
    request.on('response', (headers) => {
      const status = headers[':status']
      if (typeof status === 'number') statusCode = status
    })
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => {
      if (statusCode === undefined) {
        fail(new Error('APNs response did not include an HTTP status'))
        return
      }

      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ statusCode, body })
    })

    timeout = setTimeout(() => {
      fail(new Error('APNs request timed out'))
      request.close()
    }, 10000)
    request.end(JSON.stringify(payload))
  })

export const sendVoIPPush = async (
  voipToken: string,
  callData: {
    call_id: string
    caller_name: string
    caller_photo?: string
    channel_name: string
    agora_token: string
    agora_uid: number
    is_video: boolean
    bookingId: string | ObjectId
    expertId: string | ObjectId
    userId: string | ObjectId
  },
): Promise<TVoIPPushResult> => {
  const expiration = Math.floor(Date.now() / 1000) + 3600
  const payload = {
    aps: {
      'content-available': 1,
    },
    type: 'incoming_call',
    call_id: callData.call_id,
    caller_name: callData.caller_name,
    caller_photo: callData.caller_photo || '',
    channel_name: callData.channel_name,
    agora_token: callData.agora_token,
    agora_uid: callData.agora_uid,
    channelName: callData.channel_name,
    token: callData.agora_token,
    uid: callData.agora_uid,
    is_video: callData.is_video,
    isVideo: callData.is_video,
    bookingId: callData.bookingId,
    expertId: callData.expertId,
    userId: callData.userId,
  }

  try {
    if (!config.apns.bundleId) {
      throw new Error('APNS_BUNDLE_ID must be configured')
    }

    const response = await sendApnsRequest(
      voipToken,
      `${config.apns.bundleId}.voip`,
      expiration,
      payload,
    )

    if (response.statusCode === 200) {
      console.log(
        `[VoIP Push] Sent via ${config.apns.production ? 'production' : 'sandbox'} gateway`,
      )
      return { success: true }
    }

    let reason: string | undefined
    try {
      const responseBody = JSON.parse(response.body) as { reason?: unknown }
      if (typeof responseBody.reason === 'string') reason = responseBody.reason
    } catch {
      reason = undefined
    }

    console.error(
      `[VoIP Push] Failed (${config.apns.production ? 'production' : 'sandbox'}):`,
      response.statusCode,
      reason,
    )
    return { success: false, reason: reason || `HTTP ${response.statusCode}` }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('[VoIP Push] Error:', reason)
    return { success: false, reason }
  }
}
