import Image from "next/image";

const sizes = {
  small: 88,
  medium: 128,
  large: 160,
} as const;

type BrandMarkProps = {
  size?: keyof typeof sizes;
  className?: string;
};

export function BrandMark({ size = "medium", className = "" }: BrandMarkProps) {
  const dimension = sizes[size];

  return (
    <Image
      alt="Gabarit.AI Brasil"
      className={`shrink-0 object-contain ${className}`}
      height={dimension}
      priority
      src="/logo-gabarit-ai.png"
      width={dimension}
    />
  );
}
