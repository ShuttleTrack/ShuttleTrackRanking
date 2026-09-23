export function isUserTabBarRoute(pathname: string): boolean {
  if (pathname === '/s/[squad]/user/profile' || pathname === '/s/[squad]/user/matches') return true;
  return pathname.startsWith('/s/[squad]/game-day/');
}
