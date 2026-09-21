import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      email: string;
      name: string;
      image?: string;
      // Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): squad-specific admin/player status is no
      // longer carried on the session - it's resolved per request, per squad, via
      // lib/auth/squadAccess.ts's getSquadAccess. Only platform-superadmin status (implicitly an
      // admin of every squad) is a fixed, session-wide fact.
      isSuperAdmin: boolean;
    };
    accessToken?: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id_token?: string;
    expires_at?: number;
    refresh_token?: string;
    error?: 'RefreshAccessTokenError';
  }
}
