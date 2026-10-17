import { CookieOptions, Router } from "express";
import { loginSchema, registerSchema } from "./auth.schemas";
import { loginUser, registerEmployee } from "./auth.service";
import { env } from "../../config/env";

export const authRouter = Router();

const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000,
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

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("access_token", { path: "/" });
  return response.status(204).send();
});
