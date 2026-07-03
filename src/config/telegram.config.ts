import { registerAs } from '@nestjs/config';

import { TelegramConfig } from './interfaces';

export default registerAs('telegram-bot', (): TelegramConfig => {
  return {
    token: process.env.TELEGRAM_BOT_ACCESS_KEY,
    ownerChatId: +process.env.TELEGRAM_OWNER_CHAT_ID,
  };
});
