/**
 * Map incoming links onto app routes:
 *   https://<api-host>/p/<shareId>      -> /shared/<shareId>
 *   https://<api-host>/invite/<token>   -> /invite/<token>
 *   mymusic://shared/<shareId>, mymusic://invite/<token> work as-is.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, 'mymusic://app');
    const share = url.pathname.match(/^\/p\/([\w-]{8,32})$/);
    if (share) return `/shared/${share[1]}`;
    return path;
  } catch {
    return '/';
  }
}
