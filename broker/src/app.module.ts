import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './gateway/events.gateway';
import { RunnerService } from './runner/runner.service';
import { AuthService } from './auth/auth.service';
import { RedisModule } from './pairing/redis';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'claude-remote-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    RedisModule,
  ],
  providers: [EventsGateway, RunnerService, AuthService],
})
export class AppModule {}
