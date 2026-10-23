import settings from "../../src/settings.ini";
import { Client } from "./client";

export default function Page() {
  return (
    <main>
      <pre id="server">{JSON.stringify(settings)}</pre>
      <Client />
    </main>
  );
}
