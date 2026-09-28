import * as React from "react";
import { SpeelUIProvider } from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import { MigrationsManager } from "@speel/react/migrations";
import type { Migrator } from "@speel/migrations";

/** The migrations UI renders through the skin, so the admin page picks one. It needs
 *  no `SpeelProvider` — there is no data context here, only chrome. */
export function AdminDashboard({
  migrator,
}: {
  migrator?: Migrator;
}): React.ReactElement {
  return (
    <SpeelUIProvider ui={fluentV8Adapter}>
      <section style={{ padding: 16 }}>
        <h2>Speel Admin</h2>
        {migrator ? (
          <MigrationsManager migrator={migrator} />
        ) : (
          <p>Connecting to SharePoint…</p>
        )}
      </section>
    </SpeelUIProvider>
  );
}
