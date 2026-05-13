import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import "./Dashboard.css";

const MESES_2026 = [
  { key: "2026-01", label: "Jan" },
  { key: "2026-02", label: "Fev" },
  { key: "2026-03", label: "Mar" },
  { key: "2026-04", label: "Abr" },
  { key: "2026-05", label: "Mai" },
  { key: "2026-06", label: "Jun" },
  { key: "2026-07", label: "Jul" },
  { key: "2026-08", label: "Ago" },
  { key: "2026-09", label: "Set" },
  { key: "2026-10", label: "Out" },
  { key: "2026-11", label: "Nov" },
  { key: "2026-12", label: "Dez" },
];

const PRIORIDADES = [
  { key: "urgente", label: "Urgente", cor: "#ff5c5c" },
  { key: "alta", label: "Alta", cor: "#f5a623" },
  { key: "media", label: "Média", cor: "#4f7cff" },
  { key: "baixa", label: "Baixa", cor: "#27c97a" },
];

const COLUNAS_PADRAO = [
  { key: "backlog", title: "Backlog", ordem: 0, cor: "#6b7280" },
  { key: "a_fazer", title: "A Fazer", ordem: 1, cor: "#4f7cff" },
  { key: "em_andamento", title: "Em andamento", ordem: 2, cor: "#f5a623" },
  { key: "em_revisao", title: "Em revisão", ordem: 3, cor: "#a78bfa" },
  { key: "concluida", title: "Concluído", ordem: 4, cor: "#27c97a" },
];

const formInicial = {
  titulo: "",
  local: "",
  solicitante_nome: "",
  respondido_por_id: "",
  respondido_por_nome: "",
  resposta_executor: "",
  prioridade: "media",
  status: "a_fazer",
  descricao: "",
  prazo: "",
  mes_referencia: new Date().toISOString().slice(0, 7),
};

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function formatarData(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function getInitials(nome) {
  if (!nome) return "?";
  const parts = String(nome).trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(nome).slice(0, 2).toUpperCase();
}

function dataHojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function Toast({ msg, tipo, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`nx-toast nx-toast-${tipo}`}>
      <span className="nx-toast-icon">
        {tipo === "sucesso" ? "✓" : tipo === "erro" ? "✕" : "ℹ"}
      </span>
      {msg}
    </div>
  );
}

export default function Dashboard({ sessao }) {
  const [usuarioAtual, setUsuarioAtual] = useState(sessao?.user || null);
  const nomeUsuario =
    usuarioAtual?.user_metadata?.nome || usuarioAtual?.email || "Usuário";

  const [aba, setAba] = useState("kanban");
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [canalAtivo, setCanalAtivo] = useState(null);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
  const [filtroPrioridade, setFiltroPrioridade] = useState("todas");
  const [filtroResponsavel, setFiltroResponsavel] = useState("todos");
  const [busca, setBusca] = useState("");
  const [logsAbertos, setLogsAbertos] = useState(false);
  const [logsGlobais, setLogsGlobais] = useState([]);

  const [demandas, setDemandas] = useState([]);
  const [canais, setCanais] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [colunas, setColunas] = useState(COLUNAS_PADRAO);
  const [novoCanal, setNovoCanal] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(formInicial);
  const [anexos, setAnexos] = useState([]);
  const [logs, setLogs] = useState([]);
  const [abaModal, setAbaModal] = useState("dados");
  const [uploading, setUploading] = useState(false);

  const [modalColuna, setModalColuna] = useState(false);
  const [editandoColuna, setEditandoColuna] = useState(null);
  const [formColuna, setFormColuna] = useState({ title: "", cor: "#4f7cff" });

  const [modalUsuarios, setModalUsuarios] = useState(false);
  const [modalCanal, setModalCanal] = useState(false);
  const [editandoCanal, setEditandoCanal] = useState(null);
  const [formCanal, setFormCanal] = useState({ nome: "", descricao: "" });
  const [toast, setToast] = useState(null);

  function showToast(msg, tipo = "sucesso") {
    setToast({ msg, tipo, id: Date.now() });
  }

  useEffect(() => {
    async function verificarSessao() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setUsuarioAtual(data.session.user);
    }

    verificarSessao();

    const timeout = setTimeout(async () => {
      await supabase.auth.signOut();
      window.location.href = "/";
    }, 1000 * 60 * 60 * 8);

    return () => clearTimeout(timeout);
  }, []);

  const carregarTudo = useCallback(async () => {
    let q = supabase
      .from("demandas")
      .select("*")
      .eq("mes_referencia", mesFiltro)
      .order("criado_em", { ascending: false });

    if (canalAtivo) q = q.eq("local", canalAtivo);

    const [demRes, canRes, usrRes, colRes] = await Promise.allSettled([
      q,
      supabase.from("canais").select("*").eq("ativo", true).order("criado_em", { ascending: true }),
      supabase.from("profiles").select("*").order("criado_em", { ascending: false }),
      supabase.from("colunas_kanban").select("*").order("ordem", { ascending: true }),
    ]);

    const dem = demRes.status === "fulfilled" ? demRes.value.data || [] : [];
    const can = canRes.status === "fulfilled" ? canRes.value.data || [] : [];
    const usr = usrRes.status === "fulfilled" ? usrRes.value.data || [] : [];
    const col = colRes.status === "fulfilled" ? colRes.value.data || [] : [];

    setDemandas(dem);
    setCanais(can);
    setUsuarios(usr);
    setColunas(col.length ? col : COLUNAS_PADRAO);
  }, [mesFiltro, canalAtivo]);

  const carregarLogsGlobais = useCallback(async () => {
    const { data } = await supabase
      .from("demanda_logs")
      .select("*, demandas(titulo)")
      .order("criado_em", { ascending: false })
      .limit(80);
    setLogsGlobais(data || []);
  }, []);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  useEffect(() => {
    if (logsAbertos) carregarLogsGlobais();
  }, [logsAbertos, carregarLogsGlobais]);

  const demandasFiltradas = useMemo(() => {
    return demandas.filter((d) => {
      if (filtroPrioridade !== "todas" && d.prioridade !== filtroPrioridade) return false;
      if (filtroResponsavel !== "todos" && d.respondido_por_nome !== filtroResponsavel) return false;
      if (busca) {
        const termo = busca.toLowerCase();
        const achou =
          String(d.titulo || "").toLowerCase().includes(termo) ||
          String(d.solicitante_nome || "").toLowerCase().includes(termo) ||
          String(d.local || "").toLowerCase().includes(termo);
        if (!achou) return false;
      }
      return true;
    });
  }, [demandas, filtroPrioridade, filtroResponsavel, busca]);

  const responsaveisUnicos = useMemo(() => {
    return [...new Set(demandas.map((d) => d.respondido_por_nome).filter(Boolean))];
  }, [demandas]);

  function demandaAtrasada(d) {
    if (!d?.prazo || d.status === "concluida") return false;
    return d.prazo < dataHojeISO();
  }

  function demandaHoje(d) {
    if (!d?.prazo || d.status === "concluida") return false;
    return d.prazo === dataHojeISO();
  }

  function demandaVencendo(d) {
    if (!d?.prazo || d.status === "concluida") return false;
    const hoje = new Date(dataHojeISO() + "T00:00:00");
    const prazo = new Date(d.prazo + "T00:00:00");
    const diffDias = Math.ceil((prazo - hoje) / 86400000);
    return diffDias >= 0 && diffDias <= 2;
  }

  const demandasAtrasadas = useMemo(() => demandasFiltradas.filter(demandaAtrasada), [demandasFiltradas]);
  const demandasHoje = useMemo(() => demandasFiltradas.filter(demandaHoje), [demandasFiltradas]);
  const demandasVencendo = useMemo(() => demandasFiltradas.filter(demandaVencendo), [demandasFiltradas]);
  const mesFiltroLabel = MESES_2026.find((m) => m.key === mesFiltro)?.label || mesFiltro;

  useEffect(() => {
    if (!demandas.length) return;
    const chave = `nexus-alerta-${dataHojeISO()}-${mesFiltro}-${canalAtivo || "todos"}`;
    if (localStorage.getItem(chave)) return;
    if (demandasAtrasadas.length || demandasHoje.length) {
      localStorage.setItem(chave, "ok");
      showToast(
        `Atenção: ${demandasAtrasadas.length} atrasada(s) e ${demandasHoje.length} tarefa(s) para hoje.`,
        demandasAtrasadas.length ? "erro" : "info"
      );
    }
  }, [demandas.length, demandasAtrasadas.length, demandasHoje.length, mesFiltro, canalAtivo]);

  async function registrarLog(demanda_id, acao, detalhe = "") {
    if (!demanda_id) return;
    await supabase.from("demanda_logs").insert([
      {
        demanda_id,
        usuario_id: usuarioAtual?.id || null,
        usuario_nome: nomeUsuario,
        acao,
        detalhe,
      },
    ]);
  }

  async function sair() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setForm(formInicial);
    setAnexos([]);
    setLogs([]);
    setAbaModal("dados");
    setUploading(false);
  }

  function abrirNovaDemanda(status = "a_fazer") {
    setEditandoId(null);
    setForm({ ...formInicial, status, local: canalAtivo || "", mes_referencia: mesFiltro });
    setAnexos([]);
    setLogs([]);
    setAbaModal("dados");
    setModalAberto(true);
  }

  async function abrirEdicao(demanda) {
    setEditandoId(demanda.id);
    setForm({
      ...formInicial,
      ...demanda,
      mes_referencia: demanda.mes_referencia || mesFiltro,
    });
    setAbaModal("dados");
    setModalAberto(true);

    const [anxRes, logRes] = await Promise.allSettled([
      supabase.from("demanda_anexos").select("*").eq("demanda_id", demanda.id).order("criado_em"),
      supabase.from("demanda_logs").select("*").eq("demanda_id", demanda.id).order("criado_em", { ascending: false }),
    ]);

    setAnexos(anxRes.status === "fulfilled" ? anxRes.value.data || [] : []);
    setLogs(logRes.status === "fulfilled" ? logRes.value.data || [] : []);
  }

  async function salvarDemanda() {
    if (!form.titulo?.trim()) {
      showToast("Digite o título da demanda.", "erro");
      return;
    }

   const temResposta = String(form.resposta_executor || "").trim().length > 0;

const payload = {
  ...form,
  mes_referencia: form.mes_referencia || mesFiltro,

  respondido_por_id: temResposta
    ? usuarioAtual?.id || form.respondido_por_id || null
    : form.respondido_por_id || null,

  respondido_por_nome: temResposta
    ? nomeUsuario
    : form.respondido_por_nome || "",

  respondido_em: temResposta
    ? new Date().toISOString()
    : null,
};

    if (editandoId) {
      const antiga = demandas.find((d) => d.id === editandoId);
      const { error } = await supabase.from("demandas").update(payload).eq("id", editandoId);
      if (error) {
        showToast("Erro ao editar: " + error.message, "erro");
        return;
      }
      await registrarLog(
        editandoId,
        "editou",
        antiga?.status !== form.status ? `${antiga?.status} → ${form.status}` : "campos atualizados"
      );
      showToast("Demanda atualizada.");
    } else {
      const { data, error } = await supabase
        .from("demandas")
        .insert([
          {
            ...payload,
            cadastrado_por_id: usuarioAtual?.id || null,
            cadastrado_por_nome: nomeUsuario,
            cadastrado_por_email: usuarioAtual?.email || "",
          },
        ])
        .select()
        .single();

      if (error) {
        showToast("Erro ao salvar: " + error.message, "erro");
        return;
      }

      if (data?.id) await registrarLog(data.id, "criou", `título: ${form.titulo}`);
      showToast("Demanda criada.");
    }

    fecharModal();
    carregarTudo();
  }

  async function excluirDemanda(id) {
    if (!confirm("Excluir demanda?")) return;
    await registrarLog(id, "apagou", demandas.find((d) => d.id === id)?.titulo || "");
    const { error } = await supabase.from("demandas").delete().eq("id", id);
    if (error) {
      showToast("Erro ao excluir: " + error.message, "erro");
      return;
    }
    fecharModal();
    carregarTudo();
    showToast("Demanda excluída.", "info");
  }

  async function mudarStatus(id, novoStatus) {
    if (!id) return;
    const antiga = demandas.find((d) => d.id === id);
    const { error } = await supabase.from("demandas").update({ status: novoStatus }).eq("id", id);
    if (error) {
      showToast("Erro ao mover: " + error.message, "erro");
      return;
    }
    await registrarLog(id, "moveu", `${antiga?.status || ""} → ${novoStatus}`);
    carregarTudo();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !editandoId) return;

    const isPdf = file.type === "application/pdf";
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) {
      showToast("Anexe somente PDF ou imagem.", "erro");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${editandoId}/${Date.now()}-${slugify(file.name)}.${ext}`;

    const { error: upErr } = await supabase.storage.from("demanda-anexos").upload(path, file, { upsert: false });

    if (upErr) {
      showToast("Erro no upload: " + upErr.message, "erro");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("demanda-anexos").getPublicUrl(path);

    await supabase.from("demanda_anexos").insert([
      {
        demanda_id: editandoId,
        nome_arquivo: file.name,
        url: urlData.publicUrl,
        tipo: isPdf ? "pdf" : "imagem",
        enviado_por_id: usuarioAtual?.id || null,
      },
    ]);

    await registrarLog(editandoId, "anexou", file.name);
    const { data: anx } = await supabase
      .from("demanda_anexos")
      .select("*")
      .eq("demanda_id", editandoId)
      .order("criado_em");

    setAnexos(anx || []);
    setUploading(false);
    showToast("Arquivo anexado.");
  }

  async function excluirAnexo(anexo) {
    if (!confirm(`Excluir "${anexo.nome_arquivo}"?`)) return;

    try {
      const path = new URL(anexo.url).pathname.split("/demanda-anexos/")[1];
      if (path) await supabase.storage.from("demanda-anexos").remove([path]);
    } catch {
      /* mantém exclusão do registro */
    }

    await supabase.from("demanda_anexos").delete().eq("id", anexo.id);
    await registrarLog(editandoId, "removeu anexo", anexo.nome_arquivo);
    setAnexos((prev) => prev.filter((a) => a.id !== anexo.id));
  }

  async function criarCanal() {
    const nome = novoCanal.trim();
    if (!nome) return;

    if (canais.some((c) => c.nome?.trim().toLowerCase() === nome.toLowerCase())) {
      showToast("Esse canal já existe.", "erro");
      return;
    }

    const { error } = await supabase.from("canais").insert([{ nome, descricao: "Canal interno", ativo: true }]);
    if (error) {
      showToast("Erro ao criar canal: " + error.message, "erro");
      return;
    }

    setNovoCanal("");
    carregarTudo();
    showToast("Canal criado.");
  }

  function abrirEditarCanal(canal) {
    setEditandoCanal(canal);
    setFormCanal({ nome: canal.nome || "", descricao: canal.descricao || "" });
    setModalCanal(true);
  }

  async function salvarCanal() {
    const nome = formCanal.nome.trim();
    if (!nome || !editandoCanal) return;

    const duplicado = canais.some(
      (c) => c.id !== editandoCanal.id && c.nome?.trim().toLowerCase() === nome.toLowerCase()
    );
    if (duplicado) {
      showToast("Já existe um canal com esse nome.", "erro");
      return;
    }

    const nomeAntigo = editandoCanal.nome;
    const { error } = await supabase
      .from("canais")
      .update({ nome, descricao: formCanal.descricao || "Canal interno" })
      .eq("id", editandoCanal.id);

    if (error) {
      showToast("Erro ao editar canal: " + error.message, "erro");
      return;
    }

    if (nomeAntigo && nomeAntigo !== nome) {
      await supabase.from("demandas").update({ local: nome }).eq("local", nomeAntigo);
      if (canalAtivo === nomeAntigo) setCanalAtivo(nome);
    }

    setModalCanal(false);
    setEditandoCanal(null);
    setFormCanal({ nome: "", descricao: "" });
    carregarTudo();
    showToast("Canal atualizado.");
  }

  async function arquivarCanal() {
    if (!editandoCanal) return;
    if (!confirm(`Arquivar o canal "${editandoCanal.nome}"?`)) return;

    const { error } = await supabase.from("canais").update({ ativo: false }).eq("id", editandoCanal.id);
    if (error) {
      showToast("Erro ao arquivar: " + error.message, "erro");
      return;
    }

    if (canalAtivo === editandoCanal.nome) setCanalAtivo(null);
    setModalCanal(false);
    setEditandoCanal(null);
    carregarTudo();
  }

  async function salvarColuna() {
    if (!formColuna.title.trim()) {
      showToast("Digite o nome da coluna.", "erro");
      return;
    }

    const novoTitulo = formColuna.title.trim();

    if (editandoColuna?.id) {
      const { error } = await supabase
        .from("colunas_kanban")
        .update({
          title: novoTitulo,
          cor: formColuna.cor,
        })
        .eq("id", editandoColuna.id);

      if (error) {
        showToast("Erro ao editar coluna: " + error.message, "erro");
        return;
      }

      setColunas((prev) =>
        prev.map((c) =>
          c.id === editandoColuna.id
            ? { ...c, title: novoTitulo, cor: formColuna.cor }
            : c
        )
      );

      showToast("Coluna atualizada.");
    } else {
      const maxOrdem = colunas.reduce((m, c) => Math.max(m, c.ordem || 0), -1);

      const { error } = await supabase.from("colunas_kanban").insert([
        {
          key: `${slugify(novoTitulo)}_${Date.now()}`,
          title: novoTitulo,
          cor: formColuna.cor,
          ordem: maxOrdem + 1,
        },
      ]);

      if (error) {
        showToast("Erro ao criar coluna: " + error.message, "erro");
        return;
      }

      showToast("Coluna criada.");
    }

    setModalColuna(false);
    setEditandoColuna(null);
    setFormColuna({ title: "", cor: "#4f7cff" });
    await carregarTudo();
  }

  async function excluirColuna(col) {
    const qtd = demandas.filter((d) => d.status === col.key).length;
    if (qtd > 0) {
      showToast(`Mova os ${qtd} cards antes de excluir.`, "erro");
      return;
    }
    if (!confirm(`Excluir coluna "${col.title}"?`)) return;
    if (col.id) await supabase.from("colunas_kanban").delete().eq("id", col.id);
    carregarTudo();
  }

  function abrirEditarColuna(col) {
  setEditandoColuna(col);
  setFormColuna({
    title: col.title || "",
    cor: col.cor || "#4f7cff",
  });
  setModalColuna(true);
}

  return (
    <div className="nx-app">
      {sidebarAberta && <div className="nx-overlay" onClick={() => setSidebarAberta(false)} />}

      <aside className={`nx-sidebar${sidebarAberta ? " nx-sidebar--open" : ""}`}>
        <div className="nx-logo">
          <div className="nx-logo-mark">C</div>
          <div>
            <div className="nx-logo-title">Controle</div>
            <div className="nx-logo-sub">de Atividades</div>
          </div>
        </div>

        <span className="nx-section">Período</span>
        <div className="nx-months">
          {MESES_2026.map((m) => (
            <button
              key={m.key}
              className={`nx-month-btn${mesFiltro === m.key ? " active" : ""}`}
              onClick={() => setMesFiltro(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span className="nx-section">Canais / Setores</span>
        {canais.map((canal) => (
          <div key={canal.id} className="nx-canal-row">
            <button
              className={`nx-nav-item nx-canal-main${canalAtivo === canal.nome ? " active" : ""}`}
              onClick={() => setCanalAtivo(canalAtivo === canal.nome ? null : canal.nome)}
            >
              <span className="nx-canal-dot" /># {canal.nome}
            </button>
            <button className="nx-canal-edit" onClick={() => abrirEditarCanal(canal)} title="Editar canal">
              ✎
            </button>
          </div>
        ))}

        <div className="nx-canal-input">
          <input
            placeholder="Novo canal..."
            value={novoCanal}
            onChange={(e) => setNovoCanal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criarCanal()}
          />
          <button onClick={criarCanal}>+</button>
        </div>

        <span className="nx-section">Atividades</span>
        {[
          { key: "dashboard", icon: "▦", label: "Dashboard" },
          { key: "kanban", icon: "⊞", label: "Kanban" },
          { key: "lista", icon: "≡", label: "Lista" },
          { key: "calendario", icon: "◫", label: "Calendário" },
        ].map((item) => (
          <button
            key={item.key}
            className={`nx-nav-item${aba === item.key ? " active" : ""}`}
            onClick={() => {
              setAba(item.key);
              setSidebarAberta(false);
            }}
          >
            <span className="nx-nav-icon">{item.icon}</span>
            {item.label}
            {item.key === "kanban" && demandas.length > 0 && <span className="nx-badge">{demandas.length}</span>}
          </button>
        ))}

        <span className="nx-section">Filtros rápidos</span>
        <select className="nx-select" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}>
          <option value="todas">Todas prioridades</option>
          {PRIORIDADES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        <select className="nx-select" value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}>
          <option value="todos">Todos responsáveis</option>
          {responsaveisUnicos.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <div className="nx-sidebar-footer">
          <button className="nx-nav-item" onClick={() => setModalUsuarios(true)}>
            <span className="nx-nav-icon">◉</span> Usuários
          </button>
          <button className="nx-nav-item" onClick={() => setLogsAbertos((v) => !v)}>
            <span className="nx-nav-icon">≋</span> Logs de auditoria
          </button>
          <button
            className="nx-nav-item"
            onClick={() => {
              setEditandoColuna(null);
              setFormColuna({ title: "", cor: "#4f7cff" });
              setModalColuna(true);
            }}
          >
            <span className="nx-nav-icon">+</span> Nova coluna
          </button>

          <div className="nx-user-row">
            <div className="nx-avatar">{getInitials(nomeUsuario)}</div>
            <div className="nx-user-info">
              <div className="nx-user-name">{nomeUsuario}</div>
              <div className="nx-user-email">{usuarioAtual?.email}</div>
            </div>
          </div>

          <button className="nx-nav-item nx-nav-sair" onClick={sair}>
            <span className="nx-nav-icon">→</span> Sair
          </button>
        </div>
      </aside>

      <div className="nx-main">
        <header className="nx-topbar">
          <button className="nx-hamburger" onClick={() => setSidebarAberta((v) => !v)}>
            ☰
          </button>

          <h2 className="nx-topbar-title">
            {aba === "dashboard" ? "Dashboard" : aba === "kanban" ? "Kanban" : aba === "lista" ? "Lista" : "Calendário"}
            <span className="nx-topbar-period"> — {mesFiltroLabel} 2026</span>
            {canalAtivo && <span className="nx-topbar-canal"> #{canalAtivo}</span>}
          </h2>

          <div className="nx-topbar-right">
            <div className="nx-search">
              <span className="nx-search-icon">⌕</span>
              <input placeholder="Buscar demanda..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>

            <button className="nx-btn-ghost nx-logs-btn" onClick={() => setLogsAbertos((v) => !v)} title="Logs">
              ≋
            </button>

            <button className="nx-btn-primary" onClick={() => abrirNovaDemanda()}>
              + Nova demanda
            </button>
          </div>
        </header>

        <div className="nx-content-area">
          {(demandasAtrasadas.length > 0 || demandasHoje.length > 0 || demandasVencendo.length > 0) && (
            <div className="nx-alerta-importante">
              <div>
                🚨 <strong>Atenção necessária</strong>
                <span>
                  {demandasAtrasadas.length > 0 && ` ${demandasAtrasadas.length} atrasada(s).`}
                  {demandasHoje.length > 0 && ` ${demandasHoje.length} para hoje.`}
                  {demandasVencendo.length > 0 && ` ${demandasVencendo.length} vencendo em até 2 dias.`}
                </span>
              </div>
              <button onClick={() => setAba("dashboard")}>Ver alertas</button>
            </div>
          )}

          {aba === "dashboard" && (
            <div className="nx-dashboard">
              <div className="nx-dashboard-hero">
                <div>
                  <h1>📊 Visão geral</h1>
                  <p>Acompanhe atrasos, tarefas do dia, vencimentos e demandas por setor.</p>
                </div>
                <button className="nx-btn-primary" onClick={() => abrirNovaDemanda()}>
                  + Nova demanda
                </button>
              </div>

              <div className="nx-dashboard-grid">
                <Metric icon="📋" title="Total do mês" value={demandasFiltradas.length} text="demandas registradas" cls="nx-metric-total" />
                <Metric icon="📅" title="Tarefas de hoje" value={demandasHoje.length} text="precisam de atenção hoje" cls="nx-metric-hoje" />
                <Metric icon="⏰" title="Vencendo" value={demandasVencendo.length} text="em até 2 dias" cls="nx-metric-vencendo" />
                <Metric icon="🚨" title="Atrasadas" value={demandasAtrasadas.length} text="fora do prazo" cls="nx-metric-atrasada" />
              </div>

              <div className="nx-dashboard-panels">
                <section className="nx-dashboard-panel">
                  <div className="nx-panel-head">
                    <h3>🚨 Alertas importantes</h3>
                    <span>{demandasAtrasadas.length + demandasHoje.length + demandasVencendo.length}</span>
                  </div>
                  {[...demandasAtrasadas, ...demandasHoje, ...demandasVencendo].slice(0, 8).map((d) => (
                    <button key={d.id} className={`nx-alert-row ${demandaAtrasada(d) ? "danger" : demandaHoje(d) ? "today" : "warning"}`} onClick={() => abrirEdicao(d)}>
                      <strong>{d.titulo}</strong>
                      <span>{d.local || "Sem canal"} • prazo {formatarData(d.prazo) || "sem prazo"}</span>
                    </button>
                  ))}
                  {demandasAtrasadas.length + demandasHoje.length + demandasVencendo.length === 0 && (
                    <p className="nx-empty">Nenhum alerta importante no momento.</p>
                  )}
                </section>

                <section className="nx-dashboard-panel">
                  <div className="nx-panel-head">
                    <h3>📌 Demandas recentes</h3>
                    <span>{demandasFiltradas.length}</span>
                  </div>
                  {demandasFiltradas.slice(0, 8).map((d) => (
                    <button key={d.id} className="nx-alert-row" onClick={() => abrirEdicao(d)}>
                      <strong>{d.titulo}</strong>
                      <span>{d.local || "Sem canal"} • {d.respondido_por_nome || "Sem responsável"} • {d.status?.replace(/_/g, " ")}</span>
                    </button>
                  ))}
                </section>
              </div>

              <div className="nx-dashboard-panels">
                <section className="nx-dashboard-panel">
                  <div className="nx-panel-head">
                    <h3>🏢 Por canal / setor</h3>
                  </div>
                  {canais.map((canal) => {
                    const total = demandas.filter((d) => d.local === canal.nome).length;
                    return (
                      <button key={canal.id} className="nx-alert-row" onClick={() => { setCanalAtivo(canal.nome); setAba("kanban"); }}>
                        <strong># {canal.nome}</strong>
                        <span>{total} demanda(s)</span>
                      </button>
                    );
                  })}
                </section>

                <section className="nx-dashboard-panel">
                  <div className="nx-panel-head">
                    <h3>👤 Por responsável</h3>
                  </div>
                  {responsaveisUnicos.map((nome) => {
                    const total = demandas.filter((d) => d.respondido_por_nome === nome).length;
                    return (
                      <button key={nome} className="nx-alert-row" onClick={() => { setFiltroResponsavel(nome); setAba("kanban"); }}>
                        <strong>{nome}</strong>
                        <span>{total} demanda(s)</span>
                      </button>
                    );
                  })}
                  {responsaveisUnicos.length === 0 && <p className="nx-empty">Nenhum responsável informado ainda.</p>}
                </section>
              </div>
            </div>
          )}

          {aba === "kanban" && (
            <div className="nx-board-wrap">
              <div className="nx-board">
                {colunas.map((coluna) => {
                  const cards = demandasFiltradas.filter((d) => d.status === coluna.key);
                  return (
                    <div
                      className="nx-column"
                      key={coluna.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => mudarStatus(e.dataTransfer.getData("demandaId"), coluna.key)}
                    >
                      <div className="nx-col-header">
                        <div className="nx-col-header-left">
                          <span className="nx-col-dot" style={{ background: coluna.cor || "#4f7cff" }} />
                          <span className="nx-col-title">{coluna.title}</span>
                          <span className="nx-col-count">{cards.length}</span>
                        </div>
                        <div className="nx-col-actions">
                          <button className="nx-icon-btn" onClick={() => abrirEditarColuna(coluna)}>✎</button>
                          <button className="nx-icon-btn" onClick={() => excluirColuna(coluna)}>⊗</button>
                        </div>
                      </div>

                      <div className="nx-col-bar" style={{ background: coluna.cor || "#4f7cff" }} />

                      <div className="nx-cards">
                        {cards.map((d) => (
                          <CardDemanda key={d.id} d={d} onClick={() => abrirEdicao(d)} />
                        ))}
                      </div>

                      <button className="nx-add-card" onClick={() => abrirNovaDemanda(coluna.key)}>
                        + Adicionar card
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {aba === "lista" && (
            <div className="nx-lista">
              <table className="nx-table">
                <thead>
                  <tr>
                    <th>Título</th><th>Status</th><th>Prioridade</th><th>Solicitante</th><th>Responsável</th><th>Prazo</th><th>Canal</th>
                  </tr>
                </thead>
                <tbody>
                  {demandasFiltradas.map((d) => (
                    <tr key={d.id} className="nx-table-row" onClick={() => abrirEdicao(d)}>
                      <td className="nx-td-title">{d.titulo}</td>
                      <td><span className={`nx-status-tag nx-status-${d.status}`}>{d.status?.replace(/_/g, " ")}</span></td>
                      <td><TagPrioridade p={d.prioridade} /></td>
                      <td>{d.solicitante_nome || "—"}</td>
                      <td>{d.respondido_por_nome || "—"}</td>
                      <td className="nx-td-mono">{formatarData(d.prazo) || "—"}</td>
                      <td>{d.local || "—"}</td>
                    </tr>
                  ))}
                  {demandasFiltradas.length === 0 && (
                    <tr><td colSpan={7} className="nx-empty">Nenhuma demanda encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {aba === "calendario" && (
            <div className="nx-calendario">
              <p className="nx-cal-info">Demandas com prazo em <strong>{mesFiltroLabel} 2026</strong></p>
              <div className="nx-cal-grid">
                {demandasFiltradas
                  .filter((d) => d.prazo)
                  .sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)))
                  .map((d) => (
                    <div key={d.id} className={`nx-cal-card nx-prio-border-${d.prioridade}`} onClick={() => abrirEdicao(d)}>
                      <div className="nx-cal-date">{formatarData(d.prazo)}</div>
                      <div className="nx-cal-body">
                        <strong>{d.titulo}</strong>
                        <span>{d.respondido_por_nome || "Sem responsável"}</span>
                      </div>
                      <TagPrioridade p={d.prioridade} />
                    </div>
                  ))}
                {demandasFiltradas.filter((d) => d.prazo).length === 0 && <p className="nx-empty">Nenhuma demanda com prazo definido.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className={`nx-log-panel${logsAbertos ? " nx-log-panel--open" : ""}`}>
        <div className="nx-log-panel-header">
          <span className="nx-log-panel-icon">≋</span>
          <h3>Logs de auditoria</h3>
          <button className="nx-icon-btn" onClick={() => setLogsAbertos(false)}>✕</button>
        </div>
        <div className="nx-log-list">
          {logsGlobais.map((log) => (
            <div key={log.id} className="nx-log-entry">
              <div className="nx-log-top">
                <span className={`nx-log-badge nx-log-badge-${log.acao}`}>{log.acao}</span>
                <span className="nx-log-user">{log.usuario_nome}</span>
                <span className="nx-log-time">{new Date(log.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {log.demandas?.titulo && <div className="nx-log-demanda">"{log.demandas.titulo}"</div>}
              {log.detalhe && <div className="nx-log-detalhe">{log.detalhe}</div>}
            </div>
          ))}
          {logsGlobais.length === 0 && <p className="nx-empty nx-empty-sm">Nenhum log encontrado.</p>}
        </div>
      </aside>

      {modalAberto && (
        <div className="nx-modal-bg" onClick={fecharModal}>
          <div className="nx-modal nx-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-header">
              <h2>{editandoId ? "Editar demanda" : "Nova demanda"}</h2>
              <button className="nx-modal-close" onClick={fecharModal}>✕</button>
            </div>

            <div className="nx-modal-tabs">
              {[
                { key: "dados", label: "Dados" },
                { key: "anexos", label: `Anexos${anexos.length ? ` (${anexos.length})` : ""}` },
                { key: "historico", label: `Histórico${logs.length ? ` (${logs.length})` : ""}` },
              ].map((t) => (
                <button key={t.key} className={`nx-tab${abaModal === t.key ? " active" : ""}`} onClick={() => setAbaModal(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {abaModal === "dados" && (
              <div className="nx-modal-body">
                <div className="nx-form-grid">
                  <Field label="Título">
                    <input value={form.titulo || ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Título da demanda" />
                  </Field>

                  <Field label="Canal / Setor">
                    <select value={form.local || ""} onChange={(e) => setForm({ ...form, local: e.target.value })}>
                      <option value="">Selecione um canal</option>
                      {canais.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </Field>

                  <Field label="Solicitante">
                    <input value={form.solicitante_nome || ""} onChange={(e) => setForm({ ...form, solicitante_nome: e.target.value })} placeholder="Nome do solicitante" />
                  </Field>

                  <Field label="Responsável">
                    <select
                      value={form.respondido_por_id || ""}
                      onChange={(e) => {
                        const u = usuarios.find((x) => x.id === e.target.value);
                        setForm({ ...form, respondido_por_id: e.target.value, respondido_por_nome: u?.nome || u?.email || "" });
                      }}
                    >
                      <option value="">Selecione um usuário</option>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
                    </select>
                    <input
                     style={{ marginTop: 8 }}
                     placeholder="Ou digite o nome do responsável"
                     value={form.respondido_por_nome || ""}
                     onChange={(e) =>
                     setForm({
                     ...form,
                     respondido_por_id: "",
                     respondido_por_nome: e.target.value,
                     })
                     }
                     />
                  </Field>

                  <Field label="Prioridade">
                    <div className="nx-prio-grid">
                      {PRIORIDADES.map((p) => (
                        <button
                          type="button"
                          key={p.key}
                          className={`nx-prio-btn${form.prioridade === p.key ? " active" : ""}`}
                          style={{ "--prio": p.cor }}
                          onClick={() => setForm({ ...form, prioridade: p.key })}
                        >
                          <span className="nx-prio-dot" style={{ background: p.cor }} /> {p.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Status">
                    <select value={form.status || "a_fazer"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      {colunas.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
                    </select>
                  </Field>

                  <Field label="Prazo">
                    <input type="date" value={form.prazo || ""} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
                  </Field>

                  <Field label="Mês">
                    <input type="month" value={form.mes_referencia || mesFiltro} onChange={(e) => setForm({ ...form, mes_referencia: e.target.value })} />
                  </Field>
                </div>

                <Field label="Descrição">
                  <textarea value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva a demanda..." />
                </Field>

                <Field label="Resposta / retorno">
                  <textarea value={form.resposta_executor || ""} onChange={(e) => setForm({ ...form, resposta_executor: e.target.value })} placeholder="Resposta do executor..." />
                </Field>
              </div>
            )}

            {abaModal === "anexos" && (
              <div className="nx-modal-body">
                {!editandoId ? (
                  <p className="nx-empty">Salve a demanda primeiro para anexar arquivos.</p>
                ) : (
                  <>
                    <label className="nx-upload-area">
                      <span className="nx-upload-icon">⊕</span>
                      <span>Clique para anexar PDF ou imagem</span>
                      {uploading && <span className="nx-uploading">Enviando...</span>}
                      <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={handleUpload} />
                    </label>

                    <div className="nx-anexos-list">
                      {anexos.map((a) => (
                        <div key={a.id} className="nx-anexo-item">
                          <span className="nx-anexo-icon">{a.tipo === "pdf" ? "⊡" : "◫"}</span>
                          <a href={a.url} target="_blank" rel="noreferrer" className="nx-anexo-nome">{a.nome_arquivo}</a>
                          <button className="nx-anexo-del" onClick={() => excluirAnexo(a)}>✕</button>
                        </div>
                      ))}
                    </div>

                    {anexos.length === 0 && <p className="nx-empty">Nenhum anexo ainda.</p>}
                  </>
                )}
              </div>
            )}

            {abaModal === "historico" && (
              <div className="nx-modal-body">
                <div className="nx-log-list nx-log-list--modal">
                  {logs.map((log) => (
                    <div key={log.id} className="nx-log-entry">
                      <div className="nx-log-top">
                        <span className={`nx-log-badge nx-log-badge-${log.acao}`}>{log.acao}</span>
                        <span className="nx-log-user">{log.usuario_nome}</span>
                        <span className="nx-log-time">{new Date(log.criado_em).toLocaleString("pt-BR")}</span>
                      </div>
                      {log.detalhe && <div className="nx-log-detalhe">{log.detalhe}</div>}
                    </div>
                  ))}
                  {logs.length === 0 && <p className="nx-empty">Nenhuma ação registrada ainda.</p>}
                </div>
              </div>
            )}

            <div className="nx-modal-footer">
              {editandoId && <button className="nx-btn-danger" onClick={() => excluirDemanda(editandoId)}>Excluir</button>}
              <button className="nx-btn-ghost" onClick={fecharModal}>Cancelar</button>
              <button className="nx-btn-primary" onClick={salvarDemanda}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modalCanal && (
        <div className="nx-modal-bg" onClick={() => setModalCanal(false)}>
          <div className="nx-modal nx-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-header">
              <h2>Editar canal</h2>
              <button className="nx-modal-close" onClick={() => setModalCanal(false)}>✕</button>
            </div>

            <div className="nx-modal-body">
              <Field label="Nome do canal">
                <input value={formCanal.nome} onChange={(e) => setFormCanal({ ...formCanal, nome: e.target.value })} />
              </Field>
              <Field label="Descrição">
                <textarea value={formCanal.descricao} onChange={(e) => setFormCanal({ ...formCanal, descricao: e.target.value })} />
              </Field>
              <p className="nx-helper">Ao renomear, as demandas antigas desse canal também serão atualizadas.</p>
            </div>

            <div className="nx-modal-footer">
              <button className="nx-btn-danger" onClick={arquivarCanal}>Arquivar</button>
              <button className="nx-btn-ghost" onClick={() => setModalCanal(false)}>Cancelar</button>
              <button className="nx-btn-primary" onClick={salvarCanal}>Salvar canal</button>
            </div>
          </div>
        </div>
      )}

      {modalColuna && (
        <div className="nx-modal-bg" onClick={() => setModalColuna(false)}>
          <div className="nx-modal nx-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-header">
              <h2>{editandoColuna ? "Editar coluna" : "Nova coluna"}</h2>
              <button className="nx-modal-close" onClick={() => setModalColuna(false)}>✕</button>
            </div>

            <div className="nx-modal-body">
              <Field label="Nome da coluna">
                <input value={formColuna.title} onChange={(e) => setFormColuna({ ...formColuna, title: e.target.value })} placeholder="Ex: Em teste" />
              </Field>
              <Field label="Cor">
                <div className="nx-cor-picker">
                  {["#6b7280", "#4f7cff", "#f5a623", "#a78bfa", "#27c97a", "#ff5c5c", "#ec4899", "#0891b2"].map((cor) => (
                    <button key={cor} className={`nx-cor-dot${formColuna.cor === cor ? " selected" : ""}`} style={{ background: cor }} onClick={() => setFormColuna({ ...formColuna, cor })} />
                  ))}
                  <input type="color" value={formColuna.cor} onChange={(e) => setFormColuna({ ...formColuna, cor: e.target.value })} className="nx-color-input" />
                </div>
              </Field>
            </div>

            <div className="nx-modal-footer">
              {editandoColuna && <button className="nx-btn-danger" onClick={() => excluirColuna(editandoColuna)}>Excluir</button>}
              <button className="nx-btn-ghost" onClick={() => setModalColuna(false)}>Cancelar</button>
              <button className="nx-btn-primary" onClick={salvarColuna}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modalUsuarios && (
        <div className="nx-modal-bg" onClick={() => setModalUsuarios(false)}>
          <div className="nx-modal nx-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-header">
              <h2>Usuários cadastrados</h2>
              <button className="nx-modal-close" onClick={() => setModalUsuarios(false)}>✕</button>
            </div>

            <div className="nx-modal-body">
              {usuarios.map((u) => (
                <div key={u.id} className="nx-user-row-modal">
                  <div className="nx-avatar">{getInitials(u.nome || u.email)}</div>
                  <div>
                    <div className="nx-user-nome">{u.nome || "Sem nome"}</div>
                    <div className="nx-user-email-sm">{u.email}</div>
                  </div>
                </div>
              ))}
              {usuarios.length === 0 && <p className="nx-empty">Nenhum usuário encontrado.</p>}
            </div>

            <div className="nx-modal-footer">
              <button className="nx-btn-ghost" onClick={() => setModalUsuarios(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} tipo={toast.tipo} onClose={() => setToast(null)} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="nx-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Metric({ icon, title, value, text, cls }) {
  return (
    <div className={`nx-metric ${cls}`}>
      <span className="nx-metric-icon">{icon}</span>
      <small>{title}</small>
      <strong>{value}</strong>
      <p>{text}</p>
    </div>
  );
}

function CardDemanda({ d, onClick }) {
  const hoje = dataHojeISO();
  const atrasada = d.prazo && d.prazo < hoje && d.status !== "concluida";
  const hojePrazo = d.prazo === hoje && d.status !== "concluida";

  return (
    <div
      className={`nx-card nx-prio-border-${d.prioridade || "media"} ${atrasada ? "nx-card-atrasada" : ""} ${hojePrazo ? "nx-card-hoje" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("demandaId", d.id)}
      onClick={onClick}
    >
      <div className="nx-card-top">
        <TagPrioridade p={d.prioridade} />
        {atrasada && <span className="nx-alert-chip danger">Atrasada</span>}
        {hojePrazo && <span className="nx-alert-chip today">Hoje</span>}
        {d.prazo && <span className="nx-card-prazo">◫ {formatarData(d.prazo)}</span>}
      </div>

      <h4 className="nx-card-title">{d.titulo}</h4>

      <div className="nx-card-meta">
        {d.local && <span>◎ {d.local}</span>}
        {d.solicitante_nome && <span>◉ {d.solicitante_nome}</span>}
        {d.respondido_por_nome && <span>◈ {d.respondido_por_nome}</span>}
      </div>

      {d.resposta_executor && (
  <div className="nx-card-resposta">
    <div className="nx-card-response-header">
      <strong>Resposta</strong>

      <span>
        {d.respondido_por_nome || "Usuário"}
      </span>
    </div>

    <p>{d.resposta_executor}</p>

    {d.respondido_em && (
      <small>
        {new Date(d.respondido_em).toLocaleString("pt-BR")}
      </small>
    )}
  </div>
)}

      <div className="nx-card-footer">
        {d.respondido_por_nome && (
          <div className="nx-card-assignee">
            <div className="nx-mini-avatar">{getInitials(d.respondido_por_nome)}</div>
            <span>{d.respondido_por_nome}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TagPrioridade({ p }) {
  const map = {
    urgente: { label: "Urgente", cls: "urgente" },
    alta: { label: "Alta", cls: "alta" },
    media: { label: "Média", cls: "media" },
    baixa: { label: "Baixa", cls: "baixa" },
  };
  const item = map[p] || map.media;
  return <span className={`nx-prio-tag nx-prio-tag-${item.cls}`}>{item.label}</span>;
}
