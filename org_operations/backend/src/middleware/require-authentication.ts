import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { apiError } from "../lib/api-error";

function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "EMPLOYEE";
}

export async function requireAuthentication(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const accessToken = request.cookies?.access_token;

  if (!accessToken) {
    return apiError(response, 401, "UNAUTHENTICATED");
  }

  let payload: jwt.JwtPayload | string;
  try {
    payload = jwt.verify(accessToken, env.JWT_SECRET);
  } catch {
    return apiError(response, 401, "UNAUTHENTICATED");
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !isUserRole(payload.role)
  ) {
    return apiError(response, 401, "UNAUTHENTICATED");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, isActive: true },
    });
    if (!user?.isActive) return apiError(response, 401, "UNAUTHENTICATED");

    request.auth = {
      userId: payload.sub,
      role: user.role
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
