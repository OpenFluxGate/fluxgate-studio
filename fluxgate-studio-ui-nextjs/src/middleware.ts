import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  // Protect all routes except login, api/auth, the BFF proxy (which answers 401 as JSON itself),
  // static files, and public assets.
  matcher: [
    '/((?!login|api/auth|api/proxy|_next/static|_next/image|favicon.ico|logo.svg|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$).*)',
  ],
};
