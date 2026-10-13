import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { ApiError, requireCondition, record } from './errors.mjs';

const ACCESS_SECONDS = 15 * 60;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const digest = (value) => createHash('sha256').update(value).digest('hex');
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
export function userFields(input, requirePassword = false) {
  requireCondition(record(input));
  requireCondition(
    typeof input.username === 'string' && /^[\p{L}\p{N}_.-]{3,50}$/u.test(input.username.trim()),
    'invalid_username',
  );
  requireCondition(input.role === 'admin' || input.role === 'user', 'invalid_role');
  const email = input.email === '' || input.email == null ? null : input.email;
  requireCondition(
    email === null ||
      (typeof email === 'string' &&
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    'invalid_email',
  );
  if (requirePassword) validatePassword(input.password);
  return {
    username: input.username.trim(),
    usernameKey: input.username.trim().toLowerCase(),
    email,
    role: input.role,
  };
}
export function validatePassword(value) {
  requireCondition(
    typeof value === 'string' && value.length >= 11 && value.length <= 128,
    'invalid_password',
  );
}
export function createAuth(repository, config) {
  const secret = config.JWT_SECRET;
  function key() {
    requireCondition(
      typeof secret === 'string' && Buffer.byteLength(secret) >= 32,
      'auth_not_configured',
      503,
    );
    return new TextEncoder().encode(secret);
  }
  function origin(request) {
    requireCondition(
      request.headers.get('Origin') === (config.APP_ORIGIN || new URL(request.url).origin),
      'forbidden_origin',
      403,
    );
  }
  function cookie(token, expiresAt = Date.now() + REFRESH_MS) {
    const secure = new URL(config.APP_ORIGIN || 'https://localhost').protocol === 'https:';
    return `certificate-refresh=${token}; HttpOnly; Path=/api/auth; SameSite=Strict; ${secure ? 'Secure; ' : ''}Expires=${new Date(expiresAt).toUTCString()}`;
  }
  async function access(user, sessionId) {
    return new SignJWT({ sid: sessionId, version: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('certificate-practice')
      .setAudience('certificate-practice')
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_SECONDS}s`)
      .sign(key());
  }
  async function authenticate(request) {
    const header = request.headers.get('Authorization');
    requireCondition(header?.startsWith('Bearer '), 'login_required', 401);
    let payload;
    try {
      payload = (
        await jwtVerify(header.slice(7), key(), {
          algorithms: ['HS256'],
          issuer: 'certificate-practice',
          audience: 'certificate-practice',
        })
      ).payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, 'invalid_session');
    }
    requireCondition(
      typeof payload.sub === 'string' && typeof payload.sid === 'string',
      'invalid_session',
      401,
    );
    const [user, session] = await Promise.all([
      repository.findUser(payload.sub),
      repository.findSession(payload.sid),
    ]);
    requireCondition(
      user &&
        !user.deletedAt &&
        session &&
        session.userId === user.id &&
        !session.revokedAt &&
        session.expiresAt > Date.now() &&
        payload.version === user.tokenVersion,
      'invalid_session',
      401,
    );
    return { user, session };
  }
  async function login(request, input) {
    origin(request);
    key();
    requireCondition(
      record(input) &&
        typeof input.username === 'string' &&
        input.username.length <= 50 &&
        typeof input.password === 'string' &&
        input.password.length <= 128,
    );
    const username = input.username.trim().toLowerCase();
    const address = request.headers.get('CF-Connecting-IP') || config.LOCAL_CLIENT_IP || 'unknown';
    const allowed = await Promise.all([
      repository.consumeLimit(digest(`client:${address}`), Date.now(), 50, 15 * 60_000),
      repository.consumeLimit(digest(`login:${address}:${username}`), Date.now(), 10, 15 * 60_000),
    ]);
    requireCondition(allowed.every(Boolean), 'rate_limited', 429);
    const user = await repository.findUsername(username);
    // Unknown usernames do comparable work without constructing fake accounts.
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : (await hashPassword(input.password), false);
    requireCondition(valid && user && !user.deletedAt, 'invalid_credentials', 401);
    const sessionId = randomUUID();
    const token = `${sessionId}.${randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + REFRESH_MS;
    await repository.createSession({
      id: sessionId,
      userId: user.id,
      refreshHash: digest(token),
      expiresAt,
    });
    return {
      body: { user: publicUser(user), accessToken: await access(user, sessionId) },
      cookie: cookie(token, expiresAt),
    };
  }
  async function refresh(request) {
    origin(request);
    key();
    const token = request.headers
      .get('Cookie')
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('certificate-refresh='))
      ?.slice('certificate-refresh='.length);
    requireCondition(token && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token), 'invalid_session', 401);
    const session = await repository.findSession(token.split('.')[0]);
    requireCondition(
      session && !session.revokedAt && session.expiresAt > Date.now(),
      'invalid_session',
      401,
    );
    const user = await repository.findUser(session.userId);
    requireCondition(user && !user.deletedAt, 'invalid_session', 401);
    const next = `${session.id}.${randomBytes(32).toString('hex')}`;
    requireCondition(
      await repository.rotateSession(session.id, digest(token), digest(next), Date.now()),
      'invalid_session',
      401,
    );
    return {
      body: { user: publicUser(user), accessToken: await access(user, session.id) },
      cookie: cookie(next, session.expiresAt),
    };
  }
  async function bootstrap(request, input) {
    origin(request);
    key();
    const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    const configured = config.BOOTSTRAP_SECRET;
    requireCondition(
      typeof configured === 'string' && configured.length >= 32,
      'bootstrap_disabled',
      404,
    );
    const a = Buffer.from(digest(supplied));
    const b = Buffer.from(digest(configured));
    requireCondition(timingSafeEqual(a, b), 'forbidden', 403);
    const fields = userFields({ ...input, role: 'admin' }, true);
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      ...fields,
      passwordHash: await hashPassword(input.password),
      tokenVersion: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    requireCondition(await repository.createUser(user, true), 'already_initialized', 409);
    return publicUser(user);
  }
  return { authenticate, login, refresh, bootstrap, origin, publicUser, cookie };
}
