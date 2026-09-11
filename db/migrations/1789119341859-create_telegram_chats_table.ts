import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { id, timestampts } from '../helpers';

export class CreateTelegramChatsTable1789119341859
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'telegram_chats',
        columns: [
          id,
          {
            name: 'chat_id',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'chat_type',
            type: 'text',
          },
          {
            name: 'name',
            type: 'text',
          },
          {
            name: 'is_write_allowed',
            type: 'boolean',
            default: true,
          },
          ...timestampts,
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('telegram_chats');
  }
}
