import "@mantine/core/styles.css";

import { GameProvider } from "@/constants/GameProvider";
import { theme } from "@/constants/theme";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Suspense } from "react";

export const metadata = {
  title: "DxHub Scavenger Hunt",
  description: "find the ducks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <GameProvider>
            <Suspense fallback={<></>}>{children}</Suspense>
          </GameProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
