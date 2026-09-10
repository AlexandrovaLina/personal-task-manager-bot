import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddParentExternalIdToTasks1789039729492
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'parent_external_id',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'parent_external_id');
  }
}
