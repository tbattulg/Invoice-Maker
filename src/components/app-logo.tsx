export function AppLogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`site-logo-mark${className ? ` ${className}` : ""}`}
      focusable="false"
      viewBox="0 0 64 64"
    >
      <rect width="64" height="64" rx="15" fill="#176b5b" />
      <path
        fill="#f7faf9"
        d="M19 13h19.4L48 22.6V48a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5V16a3 3 0 0 1 3-3Z"
      />
      <path fill="#cfece5" d="M38 13v8a3 3 0 0 0 3 3h7L38 13Z" />
      <path stroke="#176b5b" strokeLinecap="round" strokeWidth="4" d="M24 31h17M24 39h12" />
      <circle cx="42" cy="43" r="8" fill="#f2b84b" />
      <path
        fill="none"
        stroke="#17211f"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
        d="m38.8 43 2.2 2.3 4.6-5"
      />
    </svg>
  );
}
