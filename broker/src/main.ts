import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS 配置
  const corsOrigins = process.env.CORS_ORIGINS || '*';
  const origins = corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim());
  
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  const host = '0.0.0.0'; // 监听所有网络接口
  
  await app.listen(port, host);
  
  console.log(`🚀 Broker running on http://localhost:${port}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   CORS Origins: ${corsOrigins}`);
}

bootstrap();
