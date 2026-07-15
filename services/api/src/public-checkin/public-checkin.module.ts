import { Module } from '@nestjs/common';
import { PublicCheckinController } from './public-checkin.controller';
import { PublicCheckinService } from './public-checkin.service';
import { QrModule } from '../qr/qr.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [QrModule, AttendanceModule],
  controllers: [PublicCheckinController],
  providers: [PublicCheckinService],
})
export class PublicCheckinModule {}
