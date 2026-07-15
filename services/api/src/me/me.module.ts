import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { QrModule } from '../qr/qr.module';

@Module({
  imports: [AuthModule, QrModule],
  controllers: [MeController],
})
export class MeModule {}
