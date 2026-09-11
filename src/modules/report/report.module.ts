import { Logger, Module } from '@nestjs/common';
import { ReportBuilderService } from './report-builder.service';
import { TaskModule } from '../task';
import { ManualEntryModule } from '../manual-entry';

@Module({
  imports: [TaskModule, ManualEntryModule],
  providers: [Logger, ReportBuilderService],
  exports: [ReportBuilderService],
})
export class ReportModule {}
