import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import config from '../../config';
import crypto from 'crypto';

const MAX_SIGNED_32_BIT_INT = 0x7FFFFFFF;

export const generate32BitUid = () => {
  return Math.floor(Math.random() * MAX_SIGNED_32_BIT_INT) + 1;
};

export const generateAgoraUidFromUserId = (userId: string) => {
  const hash = crypto.createHash('sha256').update(userId).digest();
  const uid = hash.readUInt32BE(0) % MAX_SIGNED_32_BIT_INT;

  return uid || 1;
};

export const generateAgoraToken = ({
  channelName,
  uid,
}: {
  channelName: string;
  uid: number;
}) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const expireTimestamp = currentTimestamp + Number(config.agora.tokenExpire);

  const token = RtcTokenBuilder.buildTokenWithUid(
    config.agora.appId as string,
    config.agora.appCertificate as string,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    expireTimestamp,
  );

  return {
    token,
    expireAt: expireTimestamp,
    uid,
    channelName,
  };
};
