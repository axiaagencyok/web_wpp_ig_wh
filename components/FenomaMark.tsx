type Tone = "nocturno" | "cream" | "auto";

interface Props {
  size?: number;
  tone?: Tone;
  className?: string;
  ariaLabel?: string;
}

const SRC: Record<Exclude<Tone, "auto">, string> = {
  nocturno: "/brand/fenoma-symbol-ink.png",
  cream:    "/brand/fenoma-symbol-cream.png",
};

export function FenomaMark({ size = 24, tone = "nocturno", className = "", ariaLabel }: Props) {
  const isDecorative = !ariaLabel;

  if (tone === "auto") {
    return (
      <span className={className} style={{ display: "inline-flex", lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SRC.nocturno}
          alt={ariaLabel ?? ""}
          aria-hidden={isDecorative ? "true" : undefined}
          width={size}
          height={size}
          className="block dark:hidden object-contain"
          style={{ width: size, height: size }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SRC.cream}
          alt={ariaLabel ?? ""}
          aria-hidden={isDecorative ? "true" : undefined}
          width={size}
          height={size}
          className="hidden dark:block object-contain"
          style={{ width: size, height: size }}
        />
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={SRC[tone]}
      alt={ariaLabel ?? ""}
      aria-hidden={isDecorative ? "true" : undefined}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
