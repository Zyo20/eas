import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { AttendeesModule } from './attendees/attendees.module';
import { EventsModule } from './events/events.module';
import { AttendanceModule } from './attendance/attendance.module';
import { QrModule } from './qr/qr.module';
import { PublicCheckinModule } from './public-checkin/public-checkin.module';
import { MeModule } from './me/me.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    OrgsModule,
    AttendeesModule,
    EventsModule,
    AttendanceModule,
    QrModule,
    PublicCheckinModule,
    MeModule,
    MailModule,
  ],
})
export class AppModule {}
