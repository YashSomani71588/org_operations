import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../../generated/prisma";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

export type SafeUser = Pick<User, "id" | "fullName" | "email" | "role" | "createdAt">;

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function createAccessToken(user: User): string {
  return jwt.sign(
    { email: user.email, role: user.role },
    env.JWT_SECRET,
    { subject: user.id, expiresIn: "8h" }
  );
}

export async function registerEmployee(input: {
  fullName: string;
  email: string;
  password: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existingUser) {
    return null;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      passwordHash
    }
  });

  return {
    user: toSafeUser(user),
    accessToken: createAccessToken(user)
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!user || !user.isActive) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return {
    user: toSafeUser(user),
    accessToken: createAccessToken(user)
  };
}
