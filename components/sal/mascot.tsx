import Image from "next/image";
import { cx } from "@/lib/utils";
type State =
  | "idle"
  | "blink"
  | "speaking"
  | "welcome"
  | "listening"
  | "thinking"
  | "explaining"
  | "recommendation"
  | "success"
  | "neutral";
// Keep the canonical image; future pose assets can be added without changing callers.
const poses: Partial<Record<State, string>> = {
  welcome: "/sal/welcome.png",
  idle: "/sal/welcome.png",
};
export function SalMascot({
  state = "welcome",
  size = 480,
  className,
  priority = false,
}: {
  state?: State;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cx("sal-mascot", `sal-${state}`, className)}
      style={{ width: size, maxWidth: "100%" }}
    >
      <Image
        src={poses[state] || poses.welcome!}
        width={1312}
        height={1200}
        alt="SAL, your healthcare AI companion / سال، رفيقك للرعاية الصحية"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        sizes={`(max-width: 768px) 75vw, ${size}px`}
      />
    </div>
  );
}
