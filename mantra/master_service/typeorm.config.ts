import { DataSourceOptions } from 'typeorm';
// import dotenv from 'dotenv';
// dotenv.config({path: '../.env'});
const config: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: +process.env.DB_PORT,
  database: process.env.DATABASE,
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  synchronize: true,
  extra: {
    encrypt: true,
    trustServerCertificate: true,
    retry: {
      max: 10,
      delay: 3000,
      factor: 1.5
    },
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  }
};

export default config;
