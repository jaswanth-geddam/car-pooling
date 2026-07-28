# Car-Pooling API

REST API for a car-pooling platform built with NestJS (TypeScript). Drivers can create rides between cities and passengers can book seats.

## Features
- User authentication (JWT)
- Create and manage rides
- Book seats on rides
- Email notifications
- PostgreSQL with TypeORM

## Prerequisites
- Node.js v16+
- PostgreSQL

## Setup

```bash
git clone https://github.com/jaswanth-geddam/car-pooling.git
cd car-pooling
npm install
```

Create a `.env` file with your database and JWT config, then:

```bash
# development
npm run start:dev

# production
npm run start:prod
```

## Tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e
```
