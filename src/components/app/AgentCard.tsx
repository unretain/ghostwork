import qrcode from "qrcode-generator";
import { useMemo, type CSSProperties } from "react";
import { near, PALETTE, rating, type Card } from "../../chain/near";

/** What the card face needs. A minted card has all of it; a draft has the basics. */
export type CardFace = {
  tokenId?: string;
  title: string;
  skill: string;
  about: string;
  price: string; // yoctoNEAR
  jobs: number;
  stars: number | null;
  ratings: number;
  /** asking price in yoctoNEAR if the card is for sale */
  forSale?: string | null;
  /** the onchain art (SVG data URI) and its colour name */
  media?: string | null;
  color?: string;
};

export const faceOf = (c: Card): CardFace => ({
  tokenId: c.token_id,
  title: c.title ?? `Agent #${c.token_id}`,
  skill: c.skill,
  about: c.about,
  price: c.price,
  jobs: Number(c.jobs_done),
  stars: rating(c),
  ratings: Number(c.rating_count),
  forSale: c.listed_price,
  media: c.media,
  color: c.traits.color,
});

export function QrCode({ value }: { value: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, size: n };
  }, [value]);
  return (
    <svg className="qr" viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges" role="img" aria-label="QR code for this card">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function AgentCard({ face, qr, href, big = false }: { face: CardFace; qr?: string; href?: string; big?: boolean }) {
  const style = { "--accent": PALETTE[face.color ?? ""] ?? PALETTE.Bone } as CSSProperties;
  const body = (
    <>
      <div className="gcard__art">
        {face.media && <img src={face.media} alt="" />}
        {face.forSale && <span className="gcard__sale">For sale · {near(face.forSale, 2)} NEAR</span>}
        <span className="gcard__id">{face.tokenId !== undefined ? `#${face.tokenId.padStart(4, "0")}` : "Preview"}</span>
      </div>
      <div className="gcard__body">
        <h3 className="gcard__name">{face.title || "Unnamed"}</h3>
        <p className="gcard__skill">{face.skill || "What does it do?"}</p>
        {face.about && <p className="gcard__about">{face.about}</p>}
        <p className="gcard__meta">
          <span>
            {face.jobs} {face.jobs === 1 ? "job" : "jobs"}
          </span>
          <span>{face.stars === null ? "No ratings yet" : `★ ${face.stars.toFixed(1)} (${face.ratings})`}</span>
        </p>
        <footer className="gcard__foot">
          <div className="gcard__price">
            {near(face.price)} NEAR <span>per job</span>
          </div>
          {qr && <QrCode value={qr} />}
        </footer>
      </div>
    </>
  );
  const cls = `gcard${big ? " gcard--big" : ""}`;
  return href ? (
    <a className={cls} style={style} href={href} aria-label={`${face.title}: ${face.skill}`}>
      {body}
    </a>
  ) : (
    <article className={cls} style={style}>
      {body}
    </article>
  );
}
