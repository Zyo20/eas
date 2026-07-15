import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AttendeeGuard } from './attendee.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('AUTH_SECRET') ?? 'dev-insecure-secret-change-me',
        // No global expiresIn: per-call (AuthService passes 24h for auth tokens;
        // QrService passes the event-endsAt+24h per-attendee).
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard, AdminGuard, AttendeeGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, AdminGuard, AttendeeGuard, JwtModule],
})
export class AuthModule {}
