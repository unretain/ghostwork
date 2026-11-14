import { Reveal, RevealGroup } from "../Reveal";

// Decorative tape graphics: a stacked wordmark block and a long tilted strip.
function Stacked() {
  return (
    <div className="band__stacked">
      <div className="band__stacked-inner">
        <span>GHOST</span>
        <span>WORK</span>
      </div>
    </div>
  );
}

function Strip() {
  const text = "SEALED · AUTONOMOUS · YOURS · ";
  return (
    <div className="band__strip">
      <div className="band__strip-inner">
        <span>{text.repeat(4)}</span>
      </div>
    </div>
  );
}

export function Band({ reversed = false }: { reversed?: boolean }) {
  return (
    <section className="band" aria-hidden>
      <RevealGroup>
        <Reveal order={0} style={{ width: "100%" }}>
          <div className="band__row">
            {reversed ? (
              <>
                <Strip />
                <Stacked />
              </>
            ) : (
              <>
                <Stacked />
                <Strip />
              </>
            )}
          </div>
        </Reveal>
      </RevealGroup>
    </section>
  );
}
