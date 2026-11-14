import "../../shims/buffer";
import { CardPage } from "./CardPage";
import { Deck } from "./Deck";
import { Docs } from "./Docs";
import { Tasks } from "./Tasks";
import { Toaster } from "./shared";

/** `#/app` is the deck; `#/card/<id>` is one card (what its QR code opens); `#/tasks` is the Radius task board. */
export function AppRoot({ route }: { route: string }) {
  const card = route.match(/^#\/card\/(\d+)/);
  return (
    <>
      {card ? <CardPage key={card[1]} tokenId={card[1]} /> : route.startsWith("#/tasks") ? <Tasks /> : route.startsWith("#/docs") ? <Docs /> : <Deck />}
      <Toaster />
    </>
  );
}
