import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LockScreen, { saveSession, clearSession } from "@/pages/LockScreen";

const queryClient = new QueryClient();
const INACTIVITY_MS = 30 * 60 * 1000; // auto-lock after 30 min inactivity

function isSessionValid() {
  const raw = sessionStorage.getItem("wms_auth_ts");
  if (!raw) return false;
  return Date.now() - Number(raw) < INACTIVITY_MS;
}

function AppInner() {
  const [unlocked, setUnlocked] = useState(isSessionValid);
  const [isDark, setIsDark] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      clearSession();
      setUnlocked(false);
    }, INACTIVITY_MS);
  };

  useEffect(() => {
    if (!unlocked) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => { saveSession(); resetTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const handleUnlock = () => {
    saveSession();
    setUnlocked(true);
  };

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} isDark={isDark} />;
  }

  return (
    <Switch>
      <Route path="/" component={() => (
        <Dashboard
          isDark={isDark}
          setIsDark={setIsDark}
          onLock={() => { clearSession(); setUnlocked(false); }}
        />
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppInner />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
