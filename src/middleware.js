import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request) {
  const token =
    request.cookies.get('auth_token')?.value ||
    request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    const headers = new Headers(request.headers);
    headers.set('x-user-id', String(payload.userId || payload.id || payload.sub || ''));
    headers.set('x-user-type', String(payload.userType || ''));
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.redirect(new URL('/auth', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
