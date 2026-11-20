import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PanelApp } from "./chrome/Panels";
import "./styles.css";

const isPanel = location.hash.startsWith("#/panel/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isPanel ? <PanelApp /> : <App />}</StrictMode>,
);
