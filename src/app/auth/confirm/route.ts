/* GET /auth/confirm — where Supabase's token-hash email templates send
   people ({{ .SiteURL }}/auth/confirm?token_hash=…&type=…). Same handler as
   /auth/callback, so a confirmation link works whichever template style the
   Supabase project uses. Public: /auth/* is on the middleware allow-list. */

export { GET } from '../callback/route';
