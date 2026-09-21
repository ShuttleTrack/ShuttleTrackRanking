export function isUserTabBarRoute(pathname: string): boolean {
  if (pathname === '/user/profile' || pathname === '/user/matches') return true;
  return pathname.startsWith('/game-day/');
}
