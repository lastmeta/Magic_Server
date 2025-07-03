/* eslint-disable prettier/prettier */
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath, override: true });
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose']
  });

  app.use(json());
  app.use(urlencoded({ extended: true }));

  app.setGlobalPrefix(`/v1`);

  // Enable WebSocket upgrade handling
  const httpServer = app.getHttpServer();
  // httpServer.on('upgrade', (request, socket, head) => {
  //   app.get(SocketService).wss.handleUpgrade(request, socket, head, (ws) => {
  //     app.get(SocketService).wss.emit('connection', ws, request);
  //   });
  // });
  const httpAdapter = app.get(HttpAdapterHost);
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
