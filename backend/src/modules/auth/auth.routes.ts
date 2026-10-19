import { Router, type CookieOptions } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { apiError, validationError } from "../../lib/api-error";
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
  return apiError(response, 403, "ACCOUNT_PROVISIONING_REQUIRED", "Accounts must be provisioned by a Manager or Admin.");
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const parsedBody = loginSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return validationError(response, parsedBody.error);
    }

    const result = await loginUser(parsedBody.data);

    if (!result) {
      return apiError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
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
      return apiError(response, 401, "UNAUTHENTICATED");
    }

    const user = await getCurrentUser(authenticatedUser.userId);

    if (!user) {
      response.clearCookie("access_token", clearAccessTokenCookieOptions);

      return apiError(response, 401, "UNAUTHENTICATED");
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
