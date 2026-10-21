import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import {
  AuthResponse,
  GetCurrentUserResponse,
  SignInBody,
  SignInResponse,
  SignOutResponse,
  SignUpBody,
  SignUpResponse,
} from "@workspace/api-zod";
import { db, userProfilesTable } from "@workspace/db";

export type AppRole =
  | "Admin"
  | "Senior Surveyor"
  | "Junior Surveyor"
  | "Viewer";

export type PisUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  createdAt: string;
  lastSignInAt: string | null;
};

declare global {
  namespace Express {
    interface Request {
      pisUser?: PisUser;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

function createAnonymousClient() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

const accessCookie = "pis_access";
const refreshCookie = "pis_refresh";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function setSessionCookies(
  res: Parameters<RequestHandler>[1],
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(accessCookie, accessToken, {
    ...cookieOptions,
    maxAge: 60 * 60 * 1000,
  });
  res.cookie(refreshCookie, refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookies(
  res: Parameters<RequestHandler>[1],
): void {
  res.clearCookie(accessCookie, cookieOptions);
  res.clearCookie(refreshCookie, cookieOptions);
}

function toPisUser(profile: typeof userProfilesTable.$inferSelect): PisUser {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role as AppRole,
    createdAt: profile.createdAt.toISOString(),
    lastSignInAt: profile.lastSignInAt?.toISOString() ?? null,
  };
}

function initialRoleFor(email: string): AppRole {
  const initialAdminEmail = process.env.PIS_INITIAL_ADMIN_EMAIL?.trim();
  return initialAdminEmail &&
    initialAdminEmail.toLocaleLowerCase() === email.toLocaleLowerCase()
    ? "Admin"
    : "Viewer";
}

async function getOrCreateProfile(
  id: string,
  email: string,
  fullName: string,
) {
  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, id))
    .limit(1);

  if (existing) {
    const desiredInitialRole = initialRoleFor(email);
    if (desiredInitialRole === "Admin" && existing.role !== "Admin") {
      const [promoted] = await db
        .update(userProfilesTable)
        .set({ email, fullName, role: "Admin" })
        .where(eq(userProfilesTable.id, id))
        .returning();
      return promoted;
    }
    if (existing.email !== email || existing.fullName !== fullName) {
      const [updated] = await db
        .update(userProfilesTable)
        .set({ email, fullName })
        .where(eq(userProfilesTable.id, id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(userProfilesTable)
    .values({
      id,
      email,
      fullName,
      role: initialRoleFor(email),
    })
    .returning();
  return created;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const accessToken = req.cookies?.[accessCookie];
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  const authClient = createAnonymousClient();
  let { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    const refreshToken = req.cookies?.[refreshCookie];
    if (typeof refreshToken === "string" && refreshToken.length > 0) {
      const refreshed = await authClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (refreshed.data.session && refreshed.data.user) {
        setSessionCookies(
          res,
          refreshed.data.session.access_token,
          refreshed.data.session.refresh_token,
        );
        data = { user: refreshed.data.user };
        error = null;
      }
    }
  }

  if (error || !data.user || !data.user.email) {
    clearSessionCookies(res);
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }

  const profile = await getOrCreateProfile(
    data.user.id,
    data.user.email,
    typeof data.user.user_metadata?.full_name === "string"
      ? data.user.user_metadata.full_name
      : "",
  );
  if (!profile) {
    res.status(500).json({ error: "Unable to load the user profile." });
    return;
  }

  req.pisUser = toPisUser(profile);
  next();
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.pisUser) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!roles.includes(req.pisUser.role)) {
      res.status(403).json({ error: "Your role cannot perform this action." });
      return;
    }
    next();
  };
}

const router = Router();

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid name, email, and password." });
    return;
  }

  const { email, password, fullName } = parsed.data;
  const authClient = createAnonymousClient();
  const { data, error } = await authClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error || !data.user?.email) {
    req.log.warn({ error: error?.message }, "PIS account sign-up failed");
    res.status(400).json({ error: error?.message ?? "Unable to create account." });
    return;
  }

  const profile = await getOrCreateProfile(
    data.user.id,
    data.user.email,
    fullName,
  );
  if (!profile) {
    res.status(500).json({ error: "Unable to create the user profile." });
    return;
  }

  if (data.session) {
    setSessionCookies(
      res,
      data.session.access_token,
      data.session.refresh_token,
    );
  }

  res
    .status(201)
    .json(
      SignUpResponse.parse({
        user: toPisUser(profile),
        emailConfirmationRequired: !data.session,
      }),
    );
});

router.post("/auth/signin", async (req, res): Promise<void> => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const authClient = createAnonymousClient();
  const { data, error } = await authClient.auth.signInWithPassword(parsed.data);
  if (error || !data.user?.email || !data.session) {
    req.log.warn("PIS sign-in rejected");
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  const [updated] = await db
    .update(userProfilesTable)
    .set({ lastSignInAt: new Date() })
    .where(eq(userProfilesTable.id, data.user.id))
    .returning();
  const profile =
    updated ??
    (await getOrCreateProfile(
      data.user.id,
      data.user.email,
      typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : "",
    ));
  if (!profile) {
    res.status(500).json({ error: "Unable to load the user profile." });
    return;
  }

  setSessionCookies(
    res,
    data.session.access_token,
    data.session.refresh_token,
  );
  res.json(
    SignInResponse.parse({
      user: toPisUser(profile),
      emailConfirmationRequired: false,
    }),
  );
});

router.post("/auth/signout", (_req, res): void => {
  clearSessionCookies(res);
  res.status(204).send();
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(GetCurrentUserResponse.parse(req.pisUser));
});

export default router;
