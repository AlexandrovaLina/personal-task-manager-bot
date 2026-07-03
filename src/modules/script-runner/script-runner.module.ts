import { Module } from '@nestjs/common';
import { ScriptRunnerService } from './script-runner.service';

@Module({
  providers: [ScriptRunnerService],
  exports: [ScriptRunnerService],
})
export class ScriptRunnerModule {}
