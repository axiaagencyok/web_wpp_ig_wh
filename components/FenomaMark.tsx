type Tone = "nocturno" | "cream" | "auto";

interface Props {
  size?: number;
  tone?: Tone;
  className?: string;
  ariaLabel?: string;
}

const SRC = "/brand/fenoma-symbol-ink.png";

// The PNG has a transparent background with the Nocturno symbol painted in.
// `invert` flips the dark pixels to cream while keeping the transparent areas
// transparent — exactly what we need to put the mark on dark surfaces.
const TONE_CLASS: Record<Exclude<Tone, "auto">, string> = {
  nocturno: "",
  cream:    "invert",
};

export function FenomaMark({ size = 24, tone = "nocturno", className = "", ariaLabel }: Props) {
  const isDecorative = !ariaLabel;
  const toneClass =
    tone === "auto" ? "dark:invert" : TONE_CLASS[tone];

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={SRC}
      alt={ariaLabel ?? ""}
      aria-hidden={isDecorative ? "true" : undefined}
      width={size}
      height={size}
      className={`object-contain ${toneClass} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
