export const pinoPrettyConfig = {
  target: 'pino-pretty',
  options: {
    singleLine: true,
    colorize: true,
    ignore: 'pid,hostname,context',
    translateTime: "SYS:yyyy-mm-dd'T'HH:MM:ss.l'Z'",
    messageFormat: '\x1b[33m[{context}] \x1b[32m{msg}',
  },
};
