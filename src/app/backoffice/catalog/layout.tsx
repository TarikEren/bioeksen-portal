/**
 * The layout of the catalog screens (stage B2 UI table).
 *
 * A server component. In step 3 of the stage loop the services run on mock data
 * (`src/lib/mock/catalog.ts`), so each catalog screen says so in a `warning`
 * Alert (`sds-nextjs-frontend` §8). Step 4 moves the services to the database,
 * and then this layout is deleted with the notice and the `mockNotice` keys.
 * `role="status"` is on the alert so that a screen reader reads the notice once
 * when the page opens, and it is not a failure.
 */
import { Alert } from "@heroui/react";
import type { ReactNode } from "react";

import { getRequestText } from "@/app/_lib/request";

export default async function CatalogLayout({ children }: LayoutProps<"/backoffice/catalog">): Promise<ReactNode> {
  const { text } = await getRequestText();
  return (
    <div className="flex flex-col gap-6">
      <Alert status="warning" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{text.catalog.mockNotice}</Alert.Title>
        </Alert.Content>
      </Alert>
      {children}
    </div>
  );
}
