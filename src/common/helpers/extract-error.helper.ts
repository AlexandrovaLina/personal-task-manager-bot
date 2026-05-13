interface ExtractedError {
  message: string;
  stack?: string;
}

export function extractError(error: unknown): ExtractedError {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
