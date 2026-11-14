import { BUILT_ON } from "../../content";
import { Reveal, RevealGroup } from "../Reveal";

export function BuiltOn() {
  return (
    <section id="built-on" className="built-on">
      <RevealGroup>
        <div className="container">
          <Reveal order={0}>
            <p className="eyebrow-prominent" style={{ textAlign: "center" }}>
              Built on
            </p>
          </Reveal>
          <ul className="built-on__list">
            {BUILT_ON.map((name, i) => (
              <Reveal as="li" order={i + 1} key={name} className="built-on__item">
                <div className="built-on__logo">
                  <span className="built-on__mark">{name}</span>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </RevealGroup>
    </section>
  );
}
