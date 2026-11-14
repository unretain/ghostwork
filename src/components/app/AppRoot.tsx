import "../../shims/buffer";
import { CardPage } from "./CardPage";
import { Deck } from "./Deck";
import { Toaster } from "./shared";

/** `#/app` is the deck; `#/card/<id>` is one card (what its QR code opens). */
export function AppRoot({ route }: { route: string }) {
  const card = route.match(/^#\/card\/(\d+)/);
  return (
    <>
      {card ? <CardPage key={card[1]} tokenId={card[1]} /> : <Deck />}
      <Toaster />
    </>
  );
}
