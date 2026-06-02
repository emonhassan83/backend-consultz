// src/app/socket/handlers/chat/deleteMessage.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Message } from '../../../modules/messages/messages.models';
import { callbackFn } from '../../../utils/CallbackFn';

const deleteMessageHandler = eventHandler(
  async (socket: TSocket, { messageId }: any, callback: any) => {
    const userId = socket.auth._id.toString();

    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return callbackFn(callback, { success: false, message: 'Message not found' });
      }

      if (message.sender.toString() !== userId) {
        return callbackFn(callback, { success: false, message: 'Unauthorized to delete!' });
      }

      await Message.findByIdAndDelete(messageId);

      socket.emit('message-deleted', { messageId });
      socket.to(message.receiver.toString()).emit('message-deleted', { messageId });

      callbackFn(callback, { success: true, message: 'Message deleted successfully' });
    } catch (err: any) {
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default deleteMessageHandler;