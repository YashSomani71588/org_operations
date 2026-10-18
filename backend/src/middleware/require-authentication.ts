import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env";

function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "EMPLOYEE";
}

export function requireAuthentication(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const accessToken = request.cookies?.access_token;

  if (!accessToken) {
    return response.status(401).json({
      error: "UNAUTHENTICATED"
    });
  }

  try {
    const payload = jwt.verify(accessToken, env.JWT_SECRET);

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !isUserRole(payload.role)
    ) {
      return response.status(401).json({
        error: "UNAUTHENTICATED"
      });
    }

    request.auth = {
      userId: payload.sub,
      role: payload.role
    };

    return next();
  } catch {
    return response.status(401).json({
      error: "UNAUTHENTICATED"
    });
  }
}
