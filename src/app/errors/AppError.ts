class AppError extends Error {
  public statusCode: number
  // Optional extra details returned to the client as `data` (e.g. { registerWith })
  public data?: Record<string, unknown>

  constructor(
    statusCode: number,
    message: string,
    stack = '',
    data?: Record<string, unknown>,
  ) {
    super(message)
    this.statusCode = statusCode
    this.data = data

    if (stack) {
      this.stack = stack
    } else {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

export default AppError
