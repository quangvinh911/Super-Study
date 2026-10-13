import { operatorInput } from './account-operator-input.mjs';
const input = await operatorInput();
const response = await fetch(`${input.siteUrl}/api/auth/bootstrap`, {
  method: 'POST',
  headers: {
    Origin: input.siteUrl,
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.secret}`,
    ...(input.bypassToken ? { 'OAI-Sites-Authorization': input.bypassToken } : {}),
  },
  body: JSON.stringify({
    username: input.username,
    password: input.password,
    email: input.email || null,
  }),
});
if (!response.ok)
  throw new Error(
    `Bootstrap failed (${response.status}). Check setup, credentials and whether an Admin already exists.`,
  );
console.log('Admin created. Remove BOOTSTRAP_SECRET from the runtime configuration.');
