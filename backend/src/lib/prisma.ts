import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgrespassword@localhost:5432/ops_pressure_db?schema=public";

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });