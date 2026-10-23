"use client";
import settings from "../../src/settings.ini";

// A client component, so the file is bundled for the browser too.
export function Client() {
  return <pre id="client">{JSON.stringify(settings)}</pre>;
}
