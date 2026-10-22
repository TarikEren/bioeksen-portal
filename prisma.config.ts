import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.prisma",
    // AGENTS.md > Data: the migrations are in src/prisma/migrations/ (DEC-005).
    migrations: { dir: "./src/prisma/migrations" },
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
