import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayload {
  sub: string;
  type: 'app' | 'runner';
}

@Injectable()
export class AuthService {
  private readonly runnerSecrets = new Map<string, string>([
    // 预配置的 Runner 凭证 (生产环境应从数据库读取)
    ['runner-1', 'secret-runner-1'],
  ]);

  constructor(private readonly jwtService: JwtService) {}

  validateRunnerCredentials(runnerId: string, secret: string): boolean {
    const storedSecret = this.runnerSecrets.get(runnerId);
    return storedSecret === secret;
  }

  validateAppToken(token: string): JwtPayload | null {
    // 开发环境: 接受 demo-token
    if (token === 'demo-token') {
      return { sub: 'demo-user', type: 'app' };
    }
    
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (payload.type === 'app') {
        return payload;
      }
      return null;
    } catch {
      return null;
    }
  }

  generateAppToken(userId: string): string {
    return this.jwtService.sign({ sub: userId, type: 'app' });
  }
}
