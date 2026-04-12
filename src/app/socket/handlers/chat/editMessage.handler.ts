// src/app/socket/handlers/chat/editMessage.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Message } from '../../../modules/messages/messages.models';
import { callbackFn } from '../../../utils/CallbackFn';

const editMessageHandler = eventHandler(
  async (socket: TSocket, { messageId, payload }: any, callback: any) => {
    const userId = socket.auth._id.toString();

    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return callbackFn(callback, { success: false, message: 'Message not found' });
      }

      if (message.sender.toString() !== userId) {
        return callbackFn(callback, { success: false, message: 'Unauthorized to edit!' });
      }

      message.text = payload.text || message.text;
      message.imageUrl = payload.imageUrl || message.imageUrl;
      message.isEdited = true;
      await message.save();

      const populated = await Message.findById(message._id)
        .populate('sender', 'firstName lastName photoUrl _id')
        .populate('receiver', 'firstName lastName photoUrl _id');

      socket.emit('message-updated', populated);
      socket.to(message.receiver.toString()).emit('message-updated', populated);

      callbackFn(callback, { success: true, message: 'Message edited successfully', populated });
    } catch (err: any) {
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default editMessageHandler;