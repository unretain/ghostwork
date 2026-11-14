import { useLayoutEffect, useRef } from "react";

// Per-character odometer: changed characters roll out and the new ones roll in,
// staggered left to right. Direction follows whether the value went up or down.
const DUR = 140;
const STAGGER = 10;
const EXIT_OFFSET = 10;
const EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function makeSlot(ch: string) {
  const slot = document.createElement("span");
  slot.className = "char-slot";
  slot.dataset.char = ch;
  const sizer = document.createElement("span");
  sizer.className = "char-sizer";
  sizer.textContent = ch === " " ? " " : ch;
  const face = document.createElement("span");
  face.className = "char-face";
  face.textContent = sizer.textContent;
  slot.append(sizer, face);
  return slot;
}

export function SlotText({ text, direction }: { text: string; direction: "up" | "down" }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = ref.current!;
    const chars = Array.from(text);
    const slots = Array.from(root.children) as HTMLSpanElement[];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // first render or reduced motion: just set
    if (!slots.length || reduce) {
      root.replaceChildren(...chars.map(makeSlot));
      return;
    }

    chars.forEach((ch, i) => {
      let slot = slots[i];
      if (!slot) {
        slot = makeSlot(ch);
        root.append(slot);
        return;
      }
      if (slot.dataset.char === ch) return;
      slot.dataset.char = ch;
      const display = ch === " " ? " " : ch;
      const h = slot.offsetHeight || 1;
      const sign = direction === "down" ? -1 : 1;
      const sizer = slot.querySelector(".char-sizer") as HTMLSpanElement;
      const oldFaces = Array.from(slot.querySelectorAll(".char-face")) as HTMLSpanElement[];
      const face = document.createElement("span");
      face.className = "char-face";
      face.textContent = display;
      face.style.transform = `translateY(${sign * h}px)`;
      slot.append(face);
      sizer.textContent = display;

      const delay = i * STAGGER;
      setTimeout(() => {
        for (const old of oldFaces) {
          old.style.transition = `transform ${DUR}ms ${EASING}`;
          old.style.transform = `translateY(${-sign * h}px)`;
          old.addEventListener("transitionend", () => old.remove(), { once: true });
          setTimeout(() => old.remove(), DUR + 80);
        }
      }, delay);
      setTimeout(() => {
        face.style.transition = `transform ${DUR}ms ${EASING}`;
        face.style.transform = "translateY(0)";
      }, delay + EXIT_OFFSET);
    });

    // remove extra slots
    for (let i = chars.length; i < slots.length; i++) slots[i].remove();
  }, [text, direction]);

  return <span ref={ref} className="slot-text" aria-hidden />;
}
