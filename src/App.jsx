import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessao(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (carregando) {
    return <div style={{ minHeight: "100vh", background: "#0e0f11" }} />;
  }

  if (!sessao) {
    return <Login />;
  }

  return <Dashboard sessao={sessao} />;
}