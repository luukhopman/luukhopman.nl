export type FaviconVariant =
  | "cookbook"
  | "gifts"
  | "home"
  | "login"
  | "todo"
  | "wishlist";

const svgFaviconPaths: Record<FaviconVariant, string> = {
  cookbook: "/static/cookbook-favicon.svg",
  gifts: "/static/gifts-favicon.svg",
  home: "/static/home-favicon.svg",
  login: "/static/login-favicon.svg",
  todo: "/static/todo-favicon.svg",
  wishlist: "/static/wishlist-favicon.svg",
};

export function getFaviconVariant(value: string): FaviconVariant {
  if (value in svgFaviconPaths) {
    return value as FaviconVariant;
  }

  return "home";
}

export function getSvgFaviconPath(variant: FaviconVariant): string {
  return svgFaviconPaths[variant];
}

export function getPngFaviconPath(variant: FaviconVariant, size: number): string {
  return `/favicons/${variant}?size=${size}`;
}

export function FaviconArt({ variant }: { variant: FaviconVariant }) {
  switch (variant) {
    case "cookbook":
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cookBg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#7b956e" />
              <stop offset="1" stopColor="#506a42" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#cookBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.12" />
          <rect x="21.5" y="15" width="4" height="15" rx="2" fill="#fff9f1" />
          <rect x="18.5" y="15" width="2" height="10" rx="1" fill="#fff9f1" />
          <rect x="22.5" y="15" width="2" height="10" rx="1" fill="#506a42" opacity="0.18" />
          <rect x="26.5" y="15" width="2" height="10" rx="1" fill="#fff9f1" />
          <rect x="21.5" y="29" width="4" height="20" rx="2" fill="#fff9f1" />
          <path d="M40 15c4.1 0 7.5 3.8 7.5 8.6 0 4.2-2.5 7.5-6 8.4V49h-4V15Z" fill="#f7c76d" />
        </svg>
      );
    case "gifts":
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="giftBg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#cabaff" />
              <stop offset="1" stopColor="#9575f2" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#giftBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.12" />
          <rect x="16" y="28" width="32" height="21" rx="5" fill="#fff8ff" />
          <rect x="14" y="22" width="36" height="10" rx="5" fill="#fff8ff" />
          <path d="M29 17.5c-4.1 0-7 2.7-7 6.1 0 2.9 2.2 5.4 8.3 5.4H32V17.5h-3Z" fill="#ffd86f" />
          <path d="M35 17.5c4.1 0 7 2.7 7 6.1 0 2.9-2.2 5.4-8.3 5.4H32V17.5h3Z" fill="#ffd86f" />
          <path d="M29 22h6v27h-6z" fill="#9a7cf6" />
          <path d="M16 31h32" fill="none" stroke="#9a7cf6" strokeWidth="4" />
        </svg>
      );
    case "login":
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="loginBg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f0d9b8" />
              <stop offset="1" stopColor="#cb9353" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#loginBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.13" />
          <rect x="18" y="28" width="28" height="21" rx="6" fill="#fff9f2" />
          <path d="M24 28v-4.5a8 8 0 0 1 16 0V28" fill="none" stroke="#fff9f2" strokeLinecap="round" strokeWidth="4.5" />
          <circle cx="32" cy="38" r="3" fill="#9a6326" />
          <path d="M32 41v4.5" fill="none" stroke="#9a6326" strokeLinecap="round" strokeWidth="4" />
        </svg>
      );
    case "todo":
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="todoBg" x1="10" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#76b0ff" />
              <stop offset="1" stopColor="#4e82ff" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#todoBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.14" />
          <rect x="17" y="14" width="30" height="38" rx="7" fill="#fefefe" />
          <rect x="25" y="12" width="14" height="8" rx="4" fill="#dfe9ff" />
          <path d="m23 27 3 3 6-7" fill="none" stroke="#4e82ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
          <path d="M34 25h9M34 33h9M23 40h20" fill="none" stroke="#c5d8ff" strokeLinecap="round" strokeWidth="3.5" />
          <circle cx="25.5" cy="39.5" r="2.5" fill="#4e82ff" />
        </svg>
      );
    case "wishlist":
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wishBg" x1="8" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffb86f" />
              <stop offset="1" stopColor="#f47d45" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#wishBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.14" />
          <path d="M23 27a9 9 0 0 1 18 0" fill="none" stroke="#fff8f1" strokeLinecap="round" strokeWidth="4" />
          <path d="M19 28h26l-2.4 16.8A6 6 0 0 1 36.7 50H27.3a6 6 0 0 1-5.9-5.2Z" fill="#fff8f1" />
          <rect x="23" y="33" width="3" height="11" rx="1.5" fill="#f6a15f" />
          <rect x="30.5" y="33" width="3" height="11" rx="1.5" fill="#f6a15f" />
          <rect x="38" y="33" width="3" height="11" rx="1.5" fill="#f6a15f" />
        </svg>
      );
    case "home":
    default:
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="homeBg" x1="10" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#7d9680" />
              <stop offset="1" stopColor="#556f5c" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#homeBg)" />
          <circle cx="18" cy="17" r="12" fill="#ffffff" opacity="0.12" />
          <path d="M15 31.5 32 18l17 13.5V46a6 6 0 0 1-6 6H21a6 6 0 0 1-6-6V31.5Z" fill="#fffaf2" />
          <path d="M13 31.5 32 16 51 31.5" fill="none" stroke="#fffaf2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.5" />
          <rect x="28" y="37" width="8" height="15" rx="4" fill="#f6c06b" />
          <rect x="21.5" y="34.5" width="6.5" height="6.5" rx="2.5" fill="#dbe8de" />
          <rect x="36" y="34.5" width="6.5" height="6.5" rx="2.5" fill="#dbe8de" />
        </svg>
      );
  }
}
