import { lazy, Suspense, useEffect, useState } from "react";
import { HeroBackground } from "./components/HeroBackground";
import { Hero } from "./components/Hero";
import { Nav, useHeroVisible } from "./components/Nav";
import { Band } from "./components/sections/Band";
import { Brief } from "./components/sections/Brief";
import { BuiltOn } from "./components/sections/BuiltOn";
import { Footer } from "./components/sections/Footer";
import { Owners } from "./components/sections/Owners";
import { Platform } from "./components/sections/Platform";
import { Roster } from "./components/sections/Roster";

// The app pulls in wallet and signing libraries; only load them on app routes.
const AppRoot = lazy(() => import("./components/app/AppRoot").then((m) => ({ default: m.AppRoot })));

// "#/app" is the deck, "#/card/<id>" a single card, "#/tasks" the Radius task board, "#/docs" the docs. Anything else is the landing page.
const appRoute = () => {
  const { hash } = window.location;
  return hash.startsWith("#/app") || hash.startsWith("#/card/") || hash.startsWith("#/tasks") || hash.startsWith("#/docs") ? hash : null;
};

function Landing() {
  const heroVisible = useHeroVisible();
  return (
    <div style={{ position: "relative" }}>
      <div className="nav-wrap" data-fixed={!heroVisible}>
        <Nav variant={heroVisible ? "hero" : "compact"} />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="hero-wrap">
          <HeroBackground />
          <Hero />
        </div>
        <BuiltOn />
        <Owners />
        <Band />
        <Platform />
        <Band reversed />
        <Roster />
        <Brief />
        <Footer />
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(appRoute);
  useEffect(() => {
    const on = () => {
      const next = appRoute();
      setRoute(next);
      if (next) window.scrollTo({ top: 0 });
      // Coming back from the app to a landing section: scroll once it has rendered.
      else requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  if (!route) return <Landing />;
  return (
    <div style={{ position: "relative" }}>
      <div className="nav-wrap" data-fixed="true">
        <Nav variant="compact" />
      </div>
      <Suspense fallback={<main className="app" />}>
        <AppRoot route={route} />
      </Suspense>
    </div>
  );
}
