import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManualEntryEntity } from './manual-entry.entity';
import { ManualEntryService } from './manual-entry.service';
import { JiraModule } from '../jira';

@Module({
  imports: [TypeOrmModule.forFeature([ManualEntryEntity]), JiraModule],
  providers: [Logger, ManualEntryService],
  exports: [ManualEntryService],
})
export class ManualEntryModule {}
