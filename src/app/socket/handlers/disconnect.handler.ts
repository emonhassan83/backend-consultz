import { TSocket } from "../interface/socket.interface";
import eventHandler from "../utils/eventHandler";

const disconnect = eventHandler(async (socket: TSocket) => {})

export default disconnect;