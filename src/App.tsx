import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Shell } from "./app/Shell";
import { useGlobalShortcuts } from "./app/shortcuts";
import { useBootstrap } from "./app/useBootstrap";
import { useNav } from "./store/nav";
import { useSettings } from "./store/settings";
import { ErrorNotice, Skeleton } from "./ui";
import { CatalogScreen } from "./screens/catalog/CatalogScreen";
import { DepsScreen } from "./screens/deps/DepsScreen";
import { OnboardingScreen } from "./screens/onboarding/OnboardingScreen";
import { QueueScreen } from "./screens/queue/QueueScreen";
import { ReceiveScreen } from "./screens/receive/ReceiveScreen";
import { SettingsScreen } from "./screens/settings/SettingsScreen";
import screen from "./screens/shared/screen.module.css";

const Gallery = import.meta.env.DEV ? lazy(() => import("./dev/Gallery")) : null;

function wantsGallery(): boolean {
  return (
    !!Gallery &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("gallery")
  );
}

function Screens() {
  const { t } = useTranslation();
  const route = useNav((n) => n.route);
  const settings = useSettings((s) => s.settings);
  const loadError = useSettings((s) => s.loadError);

  if (!settings) {
    return (
      <div className={screen.screen}>
        {loadError ? (
          <ErrorNotice
            code={loadError.code}
            detail={loadError.detail}
            actions={[
              {
                label: t("common.retry"),
                primary: true,
                onClick: () => void useSettings.getState().load(),
              },
            ]}
          />
        ) : (
          <Skeleton count={6} />
        )}
      </div>
    );
  }

  switch (route) {
    case "receive":
      return settings.onboarded ? <ReceiveScreen /> : <OnboardingScreen />;
    case "queue":
      return <QueueScreen />;
    case "catalog":
      return <CatalogScreen />;
    case "deps":
      return <DepsScreen />;
    case "settings":
      return <SettingsScreen />;
  }
}

function MainApp() {
  useBootstrap();
  useGlobalShortcuts();
  return (
    <Shell>
      <Screens />
    </Shell>
  );
}

export default function App() {
  if (wantsGallery() && Gallery) {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }
  return <MainApp />;
}
