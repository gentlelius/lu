import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './gateway/events.gateway';
import { RunnerService } from './runner/runner.service';
import { AuthService } from './auth/auth.service';
import { RedisModule } from './pairing/redis';
import { PairingSessionService } from './pairing/pairing-session';
import { PairingGateway } from './pairing/gateway/pairing.gateway';
import { PairingCodeService } from './pairing/pairing-code/pairing-code.service';
import { RateLimitService } from './pairing/rate-limit/rate-limit.service';
import { PairingHistoryService } from './pairing/pairing-history/pairing-history.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'claude-remote-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    RedisModule,
  ],
  providers: [
    EventsGateway,
    PairingGateway,
    RunnerService,
    AuthService,
    PairingSessionService,
    PairingCodeService,
    RateLimitService,
    PairingHistoryService,
  ],
})
export class AppModule {}
