import { Column, Entity } from 'typeorm';

import { BaseEntity } from 'src/common';

@Entity({ name: 'telegram_chats' })
export class TelegramChatEntity extends BaseEntity {
  @Column({ type: 'text', unique: true })
  public chatId: string;

  @Column({ type: 'text' })
  public chatType: string;

  @Column({ type: 'text' })
  public name: string;

  @Column({ type: 'boolean', default: true })
  public isWriteAllowed: boolean;
}
