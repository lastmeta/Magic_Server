/* eslint-disable prettier/prettier */
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath, override: true });
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, Request, Response, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SocketService } from './socket/socket.service';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose']
  });

  app.use(json());
  app.use(urlencoded({ extended: false }));

  app.use('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  app.use('/v1/dapps', (req: Request, res: Response) => {
    return res.status(200).json({
      message: 'Dapps fetched',
      data: [
        {
          website: 'https://satorinet.io',
          appURL: 'https://satorinet.io',
          imageUrl: 'https://avatars.githubusercontent.com/u/99840650?s=200&v=4',
          version: 'v1.0.0',
          name: 'Satori',
          dockerImage: 'satorinet/satorineuron',
          dockerContainerName: 'test-satori-container',
          description: 'Satori is an Open Source decentralized platform for AI and ML.',
          installScript: {
            windows: 'https://stage.satorinet.io/static/download/windows/satori-neuron.exe',
            mac: 'https://stage.satorinet.io/static/download/mac/Satori.dmg',
            linux: 'https://stage.satorinet.io/static/download/linux/satori.zip'
          }
        },
        {
          website: 'https://evrmore.io',
          appURL: 'https://evrmore.io',
          imageUrl: 'https://static.coinpaprika.com/coin/evr-evrmore/logo.png?rev=11285435',
          version: 'v1.0.0',
          name: 'Evrmore',
          dockerImage: 'magicdapps/evrmorenode',
          dockerContainerName: 'evrmorenode',
          description:
            'Evrmore (EVR) is a blockchain Decentralized Finance platform with built-in asset and DeFi primitives.',
          installScript: {
            windows: 'https://satorinet.io/static/download/windows/satori-neuron.exe',
            mac: 'https://satorinet.io/static/download/mac/Satori.dmg',
            linux: 'https://satorinet.io/static/download/linux/satori.zip'
          }
        }
      ]
    });
  });

  app.setGlobalPrefix('/v1');

  const config = new DocumentBuilder()
    .setTitle('Mantra Service')
    .setDescription('Mantra Service API with bun')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  // Enable WebSocket upgrade handling
  const httpServer = app.getHttpServer();
  httpServer.on('upgrade', (request, socket, head) => {
    app.get(SocketService).wss.handleUpgrade(request, socket, head, (ws) => {
      app.get(SocketService).wss.emit('connection', ws, request);
    });
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
