import { chatService } from "../../../modules/chat/chat.service"
import { callbackFn } from "../../../utils/CallbackFn"
import { TSocket } from "../../interface/socket.interface"
import eventHandler from "../../utils/eventHandler"

const myChatListHandler = eventHandler(
  async (socket: TSocket, _: any, callback: any) => {
    const userId = socket.data.user._id.toString()

    try {
      console.log('📋 my-chat-list event received for userId:', userId)

      const chatList = await chatService.getMyChatList(userId, {})
      console.log('📋 chatList fetched, count:', chatList?.length || 0)

      socket.emit('chat-list', chatList)
      console.log('📋 chat-list emitted to socket:', socket.id)

      // ✅ socket room check করো
      const rooms = [...socket.rooms]
      console.log('🏠 socket rooms:', rooms)
      console.log('🏠 userId room joined:', rooms.includes(userId))

      callbackFn(callback, { success: true, data: chatList })
    } catch (err: any) {
      console.error('❌ my-chat-list error:', err.message)
      callbackFn(callback, { success: false, message: err.message })
    }
  },
)

export default myChatListHandler
