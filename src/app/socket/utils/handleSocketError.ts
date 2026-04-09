import { Socket } from "socket.io";
import { TAckFn } from "../interface/socket.interface";
import ackHandler from "./ackHandler";
import AppError from "../../errors/AppError";

export const handleSocketError = (err: any, socket: Socket, ack?: TAckFn) => {
  let status = 500;
  let message = "Something went wrong!";
  let error = err;

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    status = 422;
    message = "Validation error!";
    const fieldErrors: Record<string, string> = {};

    for (const field in err.errors) {
      fieldErrors[field] = err.errors[field].message;
    }

    error = { message, fields: fieldErrors, code: "validation_error" };
  }

  // Handle duplicate key errors (Mongo error code 11000)
  else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Field '${field}' must be unique!`;
    error = { message, path: field, code: "duplicate_key" };
  }

  // Handle cast errors (invalid ObjectId, etc.)
  else if (err.name === "CastError") {
    status = 400;
    message = `Invalid value for field '${err.path}'!`;
    error = { message, path: err.path, code: "invalid_value" };
  }

  // Handle custom ApiError
  else if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
  }

  // Handle JWT errors
  else if (err.name === "JsonWebTokenError") {
    status = 401;
    message = "Invalid token!";
  } else if (err.name === "TokenExpiredError") {
    status = 401;
    message = "Token expired!";
  }

  // Fallback for generic errors
  else if (err instanceof Error) {
    message = err.message || message;
  }

  // Send ack response if provided
  if (ack) {
    ackHandler(ack, { success: false, message });
  }

  // Emit socket error event
  socket.emit("socketError", {
    success: false,
    status,
    message,
    error,
  });
};
