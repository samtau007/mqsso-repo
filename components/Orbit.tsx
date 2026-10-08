/** The slow-turning ring behind the card. It is the "o" of the Mohasaba logo. */
export default function Orbit() {
  return (
    <div className="orbit" aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
        <g className="spin-r">
          <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" strokeDasharray="2 8" />
        </g>
        <g className="spin">
          <circle cx="200" cy="200" r="150" fill="none" stroke="#3a4c6b" strokeWidth="22" />
          <path d="M200 50 A150 150 0 0 0 200 350" fill="none" stroke="#8a6ca6" strokeWidth="22" />
          <rect x="192" y="42" width="16" height="16" rx="3" fill="#fff" transform="rotate(45 200 50)" />
        </g>
      </svg>
    </div>
  );
}
