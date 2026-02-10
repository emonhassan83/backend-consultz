import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import config from '../../config';

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