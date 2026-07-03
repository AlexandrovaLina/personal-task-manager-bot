import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsCommentDirtyToTasks1747014000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'is_comment_dirty',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_comment_dirty');
  }
}
