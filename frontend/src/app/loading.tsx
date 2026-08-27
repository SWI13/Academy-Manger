import { Logo } from "@/components/ui/Logo";
import { Vfx } from "@/components/ui/Vfx";

/**
 * The boot screen.
 *
 * This is the closest thing the application has to a splash, and it is a real
 * one rather than a staged one: it appears while the shell reads the session
 * on the server, and it leaves the instant that returns. There is no minimum
 * duration and no scripted sequence - an artificial two-second logo animation
 * is two seconds taken from somebody trying to record a payment.
 *
 * The indicator is a single red line filling under the mark. No spinner: a
 * spinner says "something is happening", a line says "and it is nearly done".
 */
export default function Loading() {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-paper px-6">
      <Vfx level={2} />

      <Logo height={72} priority title="SM Academy" className="animate-mark" />

      <div
        role="status"
        aria-label="Loading"
        className="h-px w-40 overflow-hidden bg-white/10"
      >
        <span
          aria-hidden
          className="animate-meter block h-full w-full bg-sm-red shadow-[0_0_12px_1px_rgb(237_28_36/0.7)]"
        />
      </div>
    </div>
  );
}
