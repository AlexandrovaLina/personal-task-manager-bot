import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsCurrentToManualEntries1787053630096
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'manual_entries',
      new TableColumn({
        name: 'is_current',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('manual_entries', 'is_current');
  }
}
