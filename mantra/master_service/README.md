## Install Nest CLI

```bash
npm install -g @nestjs/cli
```

## Create a new Nest Project

```bash
nest new my-project
```

## Initialize and Install Packages with BUN

```bash
bun init
bun install
```

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ bun install
```

## Compile and run the project

```bash
# development
$ bun run start

# watch mode
$ bun run start:dev

# production mode
$ bun run start:prod
```

## Run tests

```bash
# unit tests
$ bun run test

# e2e tests
$ bun run test:e2e

# test coverage
$ bun run test:cov
```

## Steps to add new chain sub-service (Electrumx Supported)

1. Clone any sub-service and rename it with the chain name
2. Change connections from common.ts file to connect to the Electrumx
3. Update the logic to create pubkeys and derivation based on the chain
4. Update SERVICE_ID, SERVICE_NAME, PORT and DB config in .env file
5. Update default asset name in derived_balance_entity
6. update the create transaction logic if needed
7. Create/Update the Dockerfile with the new service details

## Steps to start all the services

1. Make sure Docker is installed and running on the host machine
2. If Redis is used of host machine then make sure it is running
3. Make sure .env files are correctly configured
4. Run the following Command

```bash
docker-compose up --build
```
