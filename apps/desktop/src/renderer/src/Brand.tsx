import iconUrl from "./assets/brand/lurkwire-icon.svg?url";
import wordmarkDark from "./assets/brand/lurkwire-wordmark-dark.svg?url";
import wordmarkLight from "./assets/brand/lurkwire-wordmark-light.svg?url";

export const brandIconUrl = iconUrl;

export function BrandMark({ className, title = "Lurkwire" }: { className?: string; title?: string }) {
  return <img className={className} src={iconUrl} alt="" title={title} draggable={false} />;
}

export function BrandWordmark({
  className,
  theme,
}: {
  className?: string;
  theme?: "light" | "dark";
}) {
  const dark = (theme ?? (typeof document !== "undefined" ? document.documentElement.dataset.theme : "light")) === "dark";
  return (
    <img
      className={className}
      src={dark ? wordmarkLight : wordmarkDark}
      alt="Lurkwire"
      draggable={false}
    />
  );
}
