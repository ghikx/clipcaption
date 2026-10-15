import { useEffect, useState } from "react";
import { Editor } from "./Editor";
import { Home } from "./Home";

// Routage par hash (#/p/<id>) : pas de configuration serveur, les liens du MCP marchent.
const readRoute = () => {
  const m = /^#\/p\/([a-z0-9-]+)/.exec(location.hash);
  return m ? { page: "editor" as const, id: m[1] } : { page: "home" as const };
};

export const App = () => {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return route.page === "editor" ? <Editor key={route.id} id={route.id} /> : <Home />;
};

export const go = (hash: string) => {
  location.hash = hash;
};

export const Logo = () => (
  <a className="logo" href="#/">
    <span className="logo-bold">clip</span>
    <span className="logo-light">caption</span>
  </a>
);
