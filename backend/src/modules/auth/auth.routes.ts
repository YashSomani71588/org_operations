import { Router, type CookieOptions } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { requireAuthentication } from "../../middleware/require-authentication";
import { loginSchema } from "./auth.schemas";
import {
  getCurrentUser,
  loginUser
} from "./auth.service";

export const authRouter = Router();

const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/"
};

const clearAccessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/"
};

authRouter.post("/register", (_request, response) => {
  return response.status(403).json({ error: "ACCOUNT_PROVISIONING_REQUIRED" });
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const parsedBody = loginSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return response.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsedBody.error.flatten().fieldErrors
      });
    }

    const result = await loginUser(parsedBody.data);

    if (!result) {
      return response.status(401).json({
        error: "INVALID_CREDENTIALS"
      });
    }

    response.cookie("access_token", result.accessToken, accessTokenCookieOptions);

    return response.status(200).json({
      user: result.user
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuthentication, async (request, response, next) => {
  try {
    const authenticatedUser = request.auth;

    if (!authenticatedUser) {
      return response.status(401).json({
        error: "UNAUTHENTICATED"
      });
    }

    const user = await getCurrentUser(authenticatedUser.userId);

    if (!user) {
      response.clearCookie("access_token", clearAccessTokenCookieOptions);

      return response.status(401).json({
        error: "UNAUTHENTICATED"
      });
    }

    return response.status(200).json({
      user
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/logout", requireAuthentication, async (request, response, next) => {
  try {
    await prisma.user.update({ where: { id: request.auth!.userId }, data: { lastSeenAt: null } });
  response.clearCookie("access_token", clearAccessTokenCookieOptions);

  return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});
