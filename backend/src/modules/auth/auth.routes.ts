import { Router, type CookieOptions } from "express";
import { env } from "../../config/env";
import { requireAuthentication } from "../../middleware/require-authentication";
import { loginSchema, registerSchema } from "./auth.schemas";
import {
  getCurrentUser,
  loginUser,
  registerEmployee
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

authRouter.post("/register", async (request, response, next) => {
  try {
    const parsedBody = registerSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return response.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsedBody.error.flatten().fieldErrors
      });
    }

    const result = await registerEmployee(parsedBody.data);

    if (!result) {
      return response.status(409).json({
        error: "EMAIL_ALREADY_EXISTS"
      });
    }

    response.cookie("access_token", result.accessToken, accessTokenCookieOptions);

    return response.status(201).json({
      user: result.user
    });
  } catch (error) {
    return next(error);
  }
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

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("access_token", clearAccessTokenCookieOptions);

  return response.status(204).send();
});