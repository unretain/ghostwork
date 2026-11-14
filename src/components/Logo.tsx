// GHOSTWORK mark: ghost glyph stacked over a lowercase wordmark (36px tall, like the reference nav logo).
export function Logo() {
  return (
    <span className="logo-mark" aria-hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 22V10a8 8 0 0 1 16 0v12l-2.67-2.3L14.67 22 12 19.7 9.33 22l-2.66-2.3L4 22Z" />
      </svg>
      <span>ghostwork</span>
    </span>
  );
}
