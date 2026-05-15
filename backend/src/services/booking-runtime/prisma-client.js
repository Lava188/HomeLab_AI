const { PrismaClient } = require("@prisma/client");

const globalForPrisma = global;

const prisma =
    globalForPrisma.__homelabPrismaClient ||
    new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__homelabPrismaClient = prisma;
}

module.exports = prisma;
