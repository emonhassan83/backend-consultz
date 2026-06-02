import { Socket } from 'socket.io';
import { USER_ROLE } from '../../interface/common.interface'

export type TSocketUser = { _id: string; email: string; role?: USER_ROLE }

export type TAckRes = { success: boolean; message?: string; data?: any };
export type TAckFn = (response: TAckRes) => void;

export type TSocketHandler<TData = any> = (
  socket: TSocket,
  data?: TData,      // ✅ optional
  ack?: TAckFn,
) => Promise<void>

export type TError = {
  message: string;
  statusCode?: number;
};

export type TSocket = Socket & {
  auth: TSocketUser;
  data?: { user?: any };
};
