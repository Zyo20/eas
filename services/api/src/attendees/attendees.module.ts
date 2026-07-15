import { Module } from '@nestjs/common';
import { AttendeesController } from './attendees.controller';
import { AttendeesService } from './attendees.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [AttendeesController],
  providers: [AttendeesService],
  exports: [AttendeesService],
})
export class AttendeesModule {}
