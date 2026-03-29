export type FaviconVariant =
  | "cookbook"
  | "garden"
  | "gifts"
  | "home"
  | "login"
  | "todo"
  | "wishlist";

const svgFaviconPaths: Record<FaviconVariant, string> = {
  cookbook: "/static/cookbook-favicon.svg",
  garden: "/static/garden-favicon.svg",
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

function HomeBadge({
  children,
  color,
  cx,
  cy,
}: {
  children: React.ReactNode;
  color: string;
  cx: number;
  cy: number;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r="8.5" fill={color} />
      {children}
    </g>
  );
}

function LandingAppFavicon({
  children,
  circleColor,
  iconColor,
}: {
  children: React.ReactNode;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="22" fill={circleColor} />
      <g fill={iconColor} stroke={iconColor}>
        {children}
      </g>
    </svg>
  );
}

function LandingAppGlyph({
  path,
  size = 24,
  viewBox,
  x = 20,
  y = 20,
}: {
  path: string;
  size?: number;
  viewBox: string;
  x?: number;
  y?: number;
}) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={viewBox} aria-hidden="true">
      <path d={path} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FaviconArt({ variant }: { variant: FaviconVariant }) {
  switch (variant) {
    case "cookbook":
      return (
        <LandingAppFavicon circleColor="#6b8474" iconColor="#fffdf8">
          <LandingAppGlyph
            x={20.75}
            y={18.75}
            size={22.5}
            viewBox="0 0 448 512"
            path="M416 0C400 0 288 32 288 176l0 112c0 35.3 28.7 64 64 64l32 0 0 128c0 17.7 14.3 32 32 32s32-14.3 32-32l0-128 0-112 0-208c0-17.7-14.3-32-32-32zM64 16C64 7.8 57.9 1 49.7 .1S34.2 4.6 32.4 12.5L2.1 148.8C.7 155.1 0 161.5 0 167.9c0 45.9 35.1 83.6 80 87.7L80 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-224.4c44.9-4.1 80-41.8 80-87.7c0-6.4-.7-12.8-2.1-19.1L191.6 12.5c-1.8-8-9.3-13.3-17.4-12.4S160 7.8 160 16l0 134.2c0 5.4-4.4 9.8-9.8 9.8c-5.1 0-9.3-3.9-9.8-9L127.9 14.6C127.2 6.3 120.3 0 112 0s-15.2 6.3-15.9 14.6L83.7 151c-.5 5.1-4.7 9-9.8 9c-5.4 0-9.8-4.4-9.8-9.8L64 16zm48.3 152l-.3 0-.3 0 .3-.7 .3 .7z"
          />
        </LandingAppFavicon>
      );
    case "garden":
      return (
        <LandingAppFavicon circleColor="#5d8f49" iconColor="#fffdf8">
          <LandingAppGlyph
            x={20.25}
            y={20.25}
            size={23.5}
            viewBox="0 0 512 512"
            path="M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0l32 0c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64l32 0c123.7 0 224 100.3 224 224l0 32 0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160C100.3 320 0 219.7 0 96z"
          />
        </LandingAppFavicon>
      );
    case "gifts":
      return (
        <LandingAppFavicon circleColor="#a78bfa" iconColor="#fffdf8">
          <LandingAppGlyph
            x={20.25}
            y={20}
            size={23.5}
            viewBox="0 0 512 512"
            path="M190.5 68.8L225.3 128l-1.3 0-72 0c-22.1 0-40-17.9-40-40s17.9-40 40-40l2.2 0c14.9 0 28.8 7.9 36.3 20.8zM64 88c0 14.4 3.5 28 9.6 40L32 128c-17.7 0-32 14.3-32 32l0 64c0 17.7 14.3 32 32 32l448 0c17.7 0 32-14.3 32-32l0-64c0-17.7-14.3-32-32-32l-41.6 0c6.1-12 9.6-25.6 9.6-40c0-48.6-39.4-88-88-88l-2.2 0c-31.9 0-61.5 16.9-77.7 44.4L256 85.5l-24.1-41C215.7 16.9 186.1 0 154.2 0L152 0C103.4 0 64 39.4 64 88zm336 0c0 22.1-17.9 40-40 40l-72 0-1.3 0 34.8-59.2C329.1 55.9 342.9 48 357.8 48l2.2 0c22.1 0 40 17.9 40 40zM32 288l0 176c0 26.5 21.5 48 48 48l144 0 0-224L32 288zM288 512l144 0c26.5 0 48-21.5 48-48l0-176-192 0 0 224z"
          />
        </LandingAppFavicon>
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
        <LandingAppFavicon circleColor="#3f7cff" iconColor="#fffdf8">
          <LandingAppGlyph
            x={20.75}
            y={20}
            size={22.5}
            viewBox="0 0 448 512"
            path="M342.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 178.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l80 80c12.5 12.5 32.8 12.5 45.3 0l160-160zm96 128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 402.7 54.6 297.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"
          />
        </LandingAppFavicon>
      );
    case "wishlist":
      return (
        <LandingAppFavicon circleColor="#ff9f43" iconColor="#fffdf8">
          <LandingAppGlyph
            x={18.75}
            y={19.5}
            size={26.5}
            viewBox="0 0 576 512"
            path="M253.3 35.1c6.1-11.8 1.5-26.3-10.2-32.4s-26.3-1.5-32.4 10.2L117.6 192 32 192c-17.7 0-32 14.3-32 32s14.3 32 32 32L83.9 463.5C91 492 116.6 512 146 512L430 512c29.4 0 55-20 62.1-48.5L544 256c17.7 0 32-14.3 32-32s-14.3-32-32-32l-85.6 0L365.3 12.9C359.2 1.2 344.7-3.4 332.9 2.7s-16.3 20.6-10.2 32.4L404.3 192l-232.6 0L253.3 35.1zM192 304l0 96c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-96c0-8.8 7.2-16 16-16s16 7.2 16 16zm96-16c8.8 0 16 7.2 16 16l0 96c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-96c0-8.8 7.2-16 16-16zm128 16l0 96c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-96c0-8.8 7.2-16 16-16s16 7.2 16 16z"
          />
        </LandingAppFavicon>
      );
    case "home":
    default:
      return (
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="homeBg" x1="10" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fffdf9" />
              <stop offset="1" stopColor="#f1ece4" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="20" fill="url(#homeBg)" />
          <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="19.25" fill="none" stroke="#e6ddd0" strokeWidth="1.5" />
          <circle cx="18" cy="16" r="11" fill="#ffffff" opacity="0.85" />
          <HomeBadge cx={21} cy={21} color="#fff7ee">
            <path d="M-3.3-1.4a3.3 3.3 0 0 1 6.6 0" fill="none" stroke="#ff9f43" strokeLinecap="round" strokeWidth="1.7" />
            <path d="M-5 0.6h10l-.9 5.7a2.1 2.1 0 0 1-2.1 1.7h-4a2.1 2.1 0 0 1-2.1-1.7Z" fill="#ff9f43" />
            <path d="M-2 2.3v3.1M0 2.3v3.1M2 2.3v3.1" fill="none" stroke="#fff7ee" strokeLinecap="round" strokeWidth="1.2" />
          </HomeBadge>
          <HomeBadge cx={43} cy={21} color="#eef4ff">
            <path d="M-4 0.5-2 2.7 1.6-1.5" fill="none" stroke="#3f7cff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            <path d="M-1.4 2.1.6 4.1 4.6-.4" fill="none" stroke="#3f7cff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </HomeBadge>
          <HomeBadge cx={32} cy={32} color="#f0f4f1">
            <rect x="-3.9" y="-4.7" width="1.8" height="6.2" rx="0.9" fill="#6b8474" />
            <rect x="-5.3" y="-4.7" width="0.9" height="4.1" rx="0.45" fill="#6b8474" />
            <rect x="-3" y="-4.7" width="0.9" height="4.1" rx="0.45" fill="#f0f4f1" />
            <rect x="-0.5" y="-4.7" width="0.9" height="4.1" rx="0.45" fill="#6b8474" />
            <rect x="-3.9" y="1.1" width="1.8" height="4.9" rx="0.9" fill="#6b8474" />
            <path d="M2.7-4.5a3.2 3.2 0 1 1 0 6.4Z" fill="#dca64a" />
            <rect x="2.7" y="-1.3" width="1.8" height="7.3" rx="0.9" fill="#dca64a" />
          </HomeBadge>
          <HomeBadge cx={21} cy={43} color="#eef7e8">
            <path d="M0 1.1v4.2" fill="none" stroke="#5d8f49" strokeLinecap="round" strokeWidth="1.7" />
            <path d="M-.4 1c-2.5 0-4.5-1.9-4.5-4.4 2.5 0 4.5 1.9 4.5 4.4Z" fill="#5d8f49" />
            <path d="M.4-1.1c0-2.6 1.8-4.7 4.2-4.7 0 2.6-1.8 4.7-4.2 4.7Z" fill="#7dbb68" />
          </HomeBadge>
          <HomeBadge cx={43} cy={43} color="#f7f3ff">
            <rect x="-4.8" y="-0.4" width="9.6" height="6.8" rx="1.5" fill="#a78bfa" />
            <rect x="-5.7" y="-3.8" width="11.4" height="3.7" rx="1.5" fill="#a78bfa" />
            <path d="M-1 2.2h2V6.4h-2z" fill="#f7f3ff" />
            <path d="M-4.8 1.4h9.6" fill="none" stroke="#f7f3ff" strokeWidth="1.4" />
            <path d="M-.6-6c-2.1 0-3.5 1.3-3.5 3 0 1.4 1.1 2.8 4.1 2.8H1V-6H-.6Z" fill="#ffd76c" />
            <path d="M.6-6c2.1 0 3.5 1.3 3.5 3 0 1.4-1.1 2.8-4.1 2.8H-1V-6H.6Z" fill="#ffd76c" />
          </HomeBadge>
        </svg>
      );
  }
}
