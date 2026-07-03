import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsHiddenToTasks1751536800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'is_hidden',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.query(
      `UPDATE "tasks" SET "is_hidden" = true WHERE "state" IN ($1, $2)`,
      ['Awaiting Client Feedback', 'Blocked'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_hidden');
  }
}
