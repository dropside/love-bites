import { useRegisterSW } from 'virtual:pwa-register/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Splash, useSplash } from './components/brand';
import { Button, FeedbackProvider, Skeleton } from './components/ui';
import { CookbookScreen } from './features/cookbook/CookbookScreen';
import { DiscoverScreen } from './features/discover/DiscoverScreen';
import { GateScreen } from './features/gate/GateScreen';
import { isUnlocked } from './features/gate/gate';
import { PantryScreen } from './features/pantry/PantryScreen';
import { PlanScreen } from './features/plan/PlanScreen';
import { RecipeScreen } from './features/recipe/RecipeScreen';
import { ShopScreen } from './features/shop/ShopScreen';

const CookScreen = lazy(() => import('./features/cook/CookScreen'));
const ShopModeScreen = lazy(() => import('./features/shop/ShopModeScreen'));
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen'));
const RecipeEditor = lazy(() => import('./features/recipe/RecipeEditor'));
const ImportScreen = lazy(() => import('./features/import/ImportScreen'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function UpdateBanner() {
  // A waiting service worker never reloads by itself, so unsaved work is safe. Ren chooses when.
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-sm font-bold text-white shadow-[var(--shadow-pop)]">
      <span>Fresh update ready.</span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
        <Button size="sm" variant="lime" onClick={() => void updateServiceWorker(true)}>Update</Button>
      </div>
    </div>
  );
}

const fallback = <div className="p-4"><Skeleton className="h-96" /></div>;

export default function App() {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const splash = useSplash();
  return (
    <FeedbackProvider>
      {splash.show && <Splash onDone={splash.done} />}
      <UpdateBanner />
      {!unlocked ? (
        <GateScreen onUnlock={() => setUnlocked(true)} />
      ) : (
        <HashRouter>
          <ScrollTop />
          <Suspense fallback={fallback}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<DiscoverScreen />} />
                <Route path="cookbook" element={<CookbookScreen />} />
                <Route path="plan" element={<PlanScreen />} />
                <Route path="shop" element={<ShopScreen />} />
                <Route path="pantry" element={<PantryScreen />} />
                <Route path="import" element={<ImportScreen />} />
                <Route path="settings" element={<SettingsScreen onLock={() => setUnlocked(false)} />} />
                <Route path="recipe/:id" element={<RecipeScreen />} />
                <Route path="recipe/:id/edit" element={<RecipeEditor />} />
              </Route>
              <Route path="recipe/:id/cook" element={<CookScreen />} />
              <Route path="shop/mode" element={<ShopModeScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      )}
    </FeedbackProvider>
  );
}
