interface Props {
  size?: number;
  className?: string;
}

export function FenomaMark({ size = 16, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {/* Main leaf — curves from top-left, broad belly, tapers to tip */}
      <path d="M12 3C9.2 3 7 5.2 7 8.2C7 10.6 8.4 12.7 10.4 13.8C9.6 15.5 8.5 16.9 7 17.8C9.8 17.5 12 15.9 13 13.7C13.3 13.8 13.7 13.8 14 13.8C16.8 13.8 19 11.6 19 8.8C19 5.5 15.9 3 12 3Z" />
      {/* Inner fold — gives the double-leaf depth */}
      <path
        d="M10.5 13.8C9.9 11.5 10.1 9 11.2 6.8C9.6 8.4 9 10.9 9.7 13.3C9.9 13.5 10.2 13.7 10.5 13.8Z"
        opacity="0.45"
      />
    </svg>
  );
}
