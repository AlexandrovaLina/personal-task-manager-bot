import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeetingEntity } from './meeting.entity';
import { CalendarService } from './calendar.service';

@Module({
  imports: [TypeOrmModule.forFeature([MeetingEntity])],
  providers: [Logger, CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
