"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  Landmark,
  MapPin,
  Search,
  Sparkles,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ComposableMap,
  Geography,
  Geographies,
} from "react-simple-maps";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

type ContestStatus =
  | "inscricoes_abertas"
  | "edital_publicado"
  | "prova_marcada"
  | "previsto"
  | "encerrado";

type Estado = {
  id: number;
  uf: string;
  nome: string;
  regiao: string | null;
  ativo: boolean;
  created_at: string;
};

type Concurso = {
  id: string;
  estado_id: number | null;
  orgao: string;
  concurso_nome: string;
  cargo: string;
  area: string | null;
  nivel: string | null;
  vagas: number;
  salario_min: number | null;
  salario_max: number | null;
  banca: string | null;
  status: ContestStatus;
  data_publicacao_edital: string | null;
  data_inicio_inscricao: string | null;
  data_fim_inscricao: string | null;
  data_prova: string | null;
  link_edital: string | null;
  link_inscricao: string | null;
  cidade_prova: string[];
  resumo: string | null;
  destaque: boolean;
  visualizacoes: number;
  created_at: string;
  updated_at: string;
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type HomeDatabase = {
  public: {
    Tables: {
      estados: Table<Estado>;
      concursos: Table<Concurso>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type MapMetrics = {
  count: number;
  vacancies: number;
  maxSalary: number;
  nextExam: string | null;
};

const BRAZIL_GEOJSON =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/main/public/data/brazil-states.geojson";

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "inscricoes_abertas", label: "Inscrições abertas" },
  { value: "edital_publicado", label: "Edital publicado" },
  { value: "prova_marcada", label: "Prova marcada" },
  { value: "previsto", label: "Previsto" },
] as const;

const LEVEL_FILTERS = ["Fundamental", "Médio", "Técnico", "Superior"];
const AREA_FILTERS = [
  "Tribunais",
  "Policial",
  "Administrativo",
  "Fiscal",
  "Saúde",
  "Educação",
];

const STATUS_LABELS: Record<ContestStatus, string> = {
  inscricoes_abertas: "Inscrições abertas",
  edital_publicado: "Edital publicado",
  prova_marcada: "Prova marcada",
  previsto: "Previsto",
  encerrado: "Encerrado",
};

const UF_BY_STATE_NAME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getUf(properties: Record<string, unknown>) {
  for (const key of ["sigla", "uf", "postal", "postal_abbreviation"]) {
    const value = properties[key];
    if (typeof value === "string" && value.length === 2) {
      return value.toUpperCase();
    }
  }
  const name = properties.name ?? properties.nome;
  return typeof name === "string" ? UF_BY_STATE_NAME[normalize(name)] ?? "" : "";
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "A definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "A definir";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function isUpcoming(value: string | null) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function statusLabel(status: ContestStatus) {
  return STATUS_LABELS[status] ?? status;
}

function heatFill(count: number) {
  if (count === 0) return "url(#heat-empty)";
  if (count <= 10) return "url(#heat-low)";
  if (count <= 30) return "url(#heat-medium)";
  if (count <= 100) return "url(#heat-high)";
  return "url(#heat-hot)";
}

function statusStyle(status: ContestStatus) {
  if (status === "inscricoes_abertas") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "previsto") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "prova_marcada") {
    return "border-indigo-200 bg-indigo-50 text-indigo-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function getMetrics(records: Concurso[], stateId: number | undefined): MapMetrics {
  const matching = records.filter(
    (contest) =>
      contest.estado_id === stateId &&
      contest.status !== "encerrado" &&
      (contest.status !== "inscricoes_abertas" ||
        !contest.data_fim_inscricao ||
        isUpcoming(contest.data_fim_inscricao)),
  );
  const nextExam = matching
    .map((contest) => contest.data_prova)
    .filter((date): date is string => Boolean(date) && isUpcoming(date))
    .sort()[0];

  return {
    count: matching.length,
    vacancies: matching.reduce((total, contest) => total + contest.vagas, 0),
    maxSalary: Math.max(
      0,
      ...matching.map((contest) => Number(contest.salario_max ?? 0)),
    ),
    nextExam: nextExam ?? null,
  };
}

function ContestCard({
  contest,
  uf,
  favorite,
  onFavorite,
  onDetails,
}: {
  contest: Concurso;
  uf: string;
  favorite: boolean;
  onFavorite: () => void;
  onDetails: () => void;
}) {
  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur transition-colors hover:border-blue-200 hover:shadow-[0_18px_40px_rgba(30,64,175,0.13)]"
      initial={{ opacity: 0, y: 12 }}
      layout
      transition={{ duration: 0.22, ease: "easeOut" }}
      whileHover={{ y: -4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            <p className="truncate">{contest.orgao}</p>
          </div>
          <h3 className="mt-2 text-base font-bold text-slate-950 transition-colors group-hover:text-blue-900">
            {contest.concurso_nome}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <Landmark aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            {contest.cargo}
          </p>
        </div>
        <motion.button
          aria-label={favorite ? "Remover dos favoritos" : "Favoritar concurso"}
          aria-pressed={favorite}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
            favorite
              ? "border-amber-200 bg-amber-50 text-amber-600"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
          onClick={onFavorite}
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.88 }}
        >
          <Star
            aria-hidden="true"
            className="h-4 w-4"
            fill={favorite ? "currentColor" : "none"}
          />
        </motion.button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(contest.status)}`}>
          {statusLabel(contest.status)}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {uf}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric icon={Building2} label="Vagas" value={contest.vagas.toLocaleString("pt-BR")} />
        <Metric icon={Banknote} label="Salário" value={formatCurrency(contest.salario_max)} />
        <Metric icon={CalendarDays} label="Prova" value={formatDate(contest.data_prova)} />
        <Metric
          icon={CalendarDays}
          label="Inscrições até"
          value={formatDate(contest.data_fim_inscricao)}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-bold text-blue-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!contest.link_edital}
          onClick={() =>
            contest.link_edital &&
            window.open(contest.link_edital, "_blank", "noopener,noreferrer")
          }
          type="button"
        >
          Ver edital
        </button>
        <button
          className="rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 px-3 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-900/15 transition hover:-translate-y-0.5 hover:shadow-md"
          onClick={onDetails}
          type="button"
        >
          Mais detalhes
        </button>
      </div>
    </motion.article>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 26,
    stiffness: 110,
    mass: 0.7,
  });
  const displayValue = useTransform(springValue, (current) =>
    Math.round(current).toLocaleString("pt-BR"),
  );

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  return <motion.span>{displayValue}</motion.span>;
}

export default function HomePage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anonKey ? createClient<HomeDatabase>(url, anonKey) : null;
  }, []);

  const [states, setStates] = useState<Estado[]>([]);
  const [mapRecords, setMapRecords] = useState<Concurso[]>([]);
  const [contests, setContests] = useState<Concurso[]>([]);
  const [globalResults, setGlobalResults] = useState<Concurso[] | null>(null);
  const [selectedUf, setSelectedUf] = useState("BR");
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [followedStates, setFollowedStates] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingContests, setLoadingContests] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [detailContest, setDetailContest] = useState<Concurso | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = "Gabarit.AI Brasil | Concursos públicos";
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    try {
      setFavorites(
        JSON.parse(localStorage.getItem("gabarita:favorites") ?? "[]") as string[],
      );
      setFollowedStates(
        JSON.parse(
          localStorage.getItem("gabarita:followed-states") ?? "[]",
        ) as string[],
      );
    } catch {
      setError("Não foi possível carregar as preferências salvas neste navegador.");
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError(
        "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para carregar concursos reais.",
      );
      setLoadingStates(false);
      setLoadingContests(false);
      return;
    }

    const client = supabase;
    let active = true;
    async function loadMapData() {
      setLoadingStates(true);
      const { data: stateRows, error: stateError } = await client
        .from("estados")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (stateError) {
        if (active) {
          setError(`Não foi possível carregar os estados: ${stateError.message}`);
          setLoadingStates(false);
        }
        return;
      }

      const { data: contestRows, error: contestError } = await client
        .from("concursos")
        .select(
          "id,estado_id,orgao,concurso_nome,cargo,area,nivel,vagas,salario_min,salario_max,banca,status,data_publicacao_edital,data_inicio_inscricao,data_fim_inscricao,data_prova,link_edital,link_inscricao,cidade_prova,resumo,destaque,visualizacoes,created_at,updated_at",
        )
        .limit(5000);
      if (contestError) {
        if (active) {
          setError(
            `Não foi possível carregar os concursos: ${contestError.message}`,
          );
          setLoadingStates(false);
          setLoadingContests(false);
        }
        return;
      }

      if (active) {
        setStates(stateRows ?? []);
        setMapRecords(contestRows ?? []);
        setLoadingStates(false);
      }
    }

    void loadMapData().catch((loadError: unknown) => {
      if (active) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha inesperada ao carregar o mapa.",
        );
        setLoadingStates(false);
        setLoadingContests(false);
      }
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || states.length === 0) return;
    const client = supabase;
    const state = states.find((item) => item.uf === selectedUf);
    if (!state) {
      setContests([]);
      setLoadingContests(false);
      setError(`O estado ${selectedUf} não está cadastrado na tabela estados.`);
      return;
    }

    const stateId = state.id;
    const stateName = state.nome;
    let active = true;
    async function loadStateContests() {
      setLoadingContests(true);
      setError("");
      const { data, error: queryError } = await client
        .from("concursos")
        .select(
          "id,estado_id,orgao,concurso_nome,cargo,area,nivel,vagas,salario_min,salario_max,banca,status,data_publicacao_edital,data_inicio_inscricao,data_fim_inscricao,data_prova,link_edital,link_inscricao,cidade_prova,resumo,destaque,visualizacoes,created_at,updated_at",
        )
        .eq("estado_id", stateId)
        .order("destaque", { ascending: false })
        .order("data_prova", { ascending: true, nullsFirst: false });

      if (!active) return;
      if (queryError) {
        setError(`Não foi possível buscar ${stateName}: ${queryError.message}`);
        setContests([]);
      } else {
        setContests(data ?? []);
      }
      setLoadingContests(false);
    }

    void loadStateContests().catch((loadError: unknown) => {
      if (active) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha inesperada ao carregar os concursos.",
        );
        setContests([]);
        setLoadingContests(false);
      }
    });

    return () => {
      active = false;
    };
  }, [selectedUf, states, supabase]);

  const stateById = useMemo(
    () => new Map(states.map((state) => [state.id, state])),
    [states],
  );

  const selectedState = states.find((state) => state.uf === selectedUf);
  const sourceRecords = globalResults ?? contests;
  const visibleContests = useMemo(() => {
    const search = normalize(query);
    return sourceRecords.filter((contest) => {
      const contestUf = stateById.get(contest.estado_id ?? -1)?.uf ?? "BR";
      const matchesFavorite = !showFavorites || favorites.includes(contest.id);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "inscricoes_abertas"
          ? contest.status === "inscricoes_abertas" &&
            (!contest.data_fim_inscricao || isUpcoming(contest.data_fim_inscricao))
          : contest.status === statusFilter);
      const matchesLevel =
        !levelFilter ||
        normalize(contest.nivel ?? "").includes(normalize(levelFilter));
      const matchesArea =
        !areaFilter ||
        normalize(contest.area ?? "").includes(normalize(areaFilter));
      const matchesSearch =
        !search ||
        normalize(
          [
            contest.orgao,
            contest.concurso_nome,
            contest.cargo,
            contest.area,
            contest.nivel,
            contestUf,
            stateById.get(contest.estado_id ?? -1)?.nome,
            ...contest.cidade_prova,
          ].join(" "),
        ).includes(search);
      return (
        contest.status !== "encerrado" &&
        (contest.status !== "inscricoes_abertas" ||
          !contest.data_fim_inscricao ||
          isUpcoming(contest.data_fim_inscricao)) &&
        matchesFavorite &&
        matchesStatus &&
        matchesLevel &&
        matchesArea &&
        matchesSearch
      );
    });
  }, [
    areaFilter,
    favorites,
    levelFilter,
    query,
    showFavorites,
    sourceRecords,
    stateById,
    statusFilter,
  ]);

  const metricsByUf = useMemo(() => {
    const result = new Map<string, MapMetrics>();
    for (const state of states) {
      result.set(state.uf, getMetrics(mapRecords, state.id));
    }
    return result;
  }, [mapRecords, states]);

  const selectedMetrics = metricsByUf.get(selectedUf) ?? {
    count: contests.length,
    vacancies: contests.reduce((total, contest) => total + contest.vagas, 0),
    maxSalary: Math.max(
      0,
      ...contests.map((contest) => Number(contest.salario_max ?? 0)),
    ),
    nextExam:
      contests
        .map((contest) => contest.data_prova)
        .filter((date): date is string => Boolean(date) && isUpcoming(date))
        .sort()[0] ?? null,
  };

  function chooseState(uf: string) {
    setSelectedUf(uf);
    setGlobalResults(null);
    setQuery("");
    setShowFavorites(false);
    setStatusFilter("all");
    setLevelFilter("");
    setAreaFilter("");
    setMobilePanelOpen(true);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      try {
        localStorage.setItem("gabarita:favorites", JSON.stringify(next));
      } catch {
        setError("Não foi possível salvar favoritos neste navegador.");
        return current;
      }
      return next;
    });
  }

  function toggleFollowState() {
    setFollowedStates((current) => {
      const next = current.includes(selectedUf)
        ? current.filter((value) => value !== selectedUf)
        : [...current, selectedUf];
      try {
        localStorage.setItem("gabarita:followed-states", JSON.stringify(next));
      } catch {
        setError("Não foi possível salvar estados seguidos neste navegador.");
        return current;
      }
      return next;
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const search = normalize(query);
    const matchingState = states.find(
      (state) =>
        normalize(state.uf) === search || normalize(state.nome).includes(search),
    );
    if (matchingState && search) {
      chooseState(matchingState.uf);
      return;
    }
    if (!search) {
      setGlobalResults(null);
      setShowFavorites(false);
      return;
    }
    if (!supabase) {
      setError("A conexão com o Supabase não está configurada.");
      return;
    }

    setSearching(true);
    setShowFavorites(false);
    try {
      const { data, error: searchError } = await supabase
        .from("concursos")
        .select(
          "id,estado_id,orgao,concurso_nome,cargo,area,nivel,vagas,salario_min,salario_max,banca,status,data_publicacao_edital,data_inicio_inscricao,data_fim_inscricao,data_prova,link_edital,link_inscricao,cidade_prova,resumo,destaque,visualizacoes,created_at,updated_at",
        )
        .limit(5000);
      if (searchError) {
        setError(`Não foi possível pesquisar: ${searchError.message}`);
        setGlobalResults([]);
        return;
      }
      setGlobalResults(
        (data ?? []).filter((contest) => {
          const uf = stateById.get(contest.estado_id ?? -1)?.uf ?? "BR";
          const stateName = stateById.get(contest.estado_id ?? -1)?.nome ?? "";
          return normalize(
            [
              contest.orgao,
              contest.concurso_nome,
              contest.cargo,
              contest.area,
              contest.nivel,
              uf,
              stateName,
              ...contest.cidade_prova,
            ].join(" "),
          ).includes(search);
        }),
      );
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Falha inesperada ao pesquisar concursos.",
      );
      setGlobalResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function showFavoritesList() {
    setShowFavorites(true);
    setGlobalResults(null);
    setQuery("");
    setMobilePanelOpen(true);
    if (!supabase) return;
    setSearching(true);
    try {
      const { data, error: searchError } = await supabase
        .from("concursos")
        .select(
          "id,estado_id,orgao,concurso_nome,cargo,area,nivel,vagas,salario_min,salario_max,banca,status,data_publicacao_edital,data_inicio_inscricao,data_fim_inscricao,data_prova,link_edital,link_inscricao,cidade_prova,resumo,destaque,visualizacoes,created_at,updated_at",
        )
        .limit(5000);
      if (searchError) {
        setError(`Não foi possível carregar favoritos: ${searchError.message}`);
        setGlobalResults([]);
      } else {
        setGlobalResults(data ?? []);
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Falha inesperada ao carregar favoritos.",
      );
      setGlobalResults([]);
    } finally {
      setSearching(false);
    }
  }

  const hoveredState = states.find((state) => state.uf === hoveredUf);
  const hoveredMetrics = hoveredUf ? metricsByUf.get(hoveredUf) : null;
  const nationalMetrics = metricsByUf.get("BR") ?? {
    count: 0,
    vacancies: 0,
    maxSalary: 0,
    nextExam: null,
  };

  return (
    <main
      className="min-h-screen bg-[#f7f9fc] text-slate-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at 5% 2%, rgba(59,130,246,.11), transparent 34%), radial-gradient(circle at 95% 78%, rgba(34,197,94,.10), transparent 30%)",
      }}
    >
      <header
        className={`fixed inset-x-0 top-0 z-30 border-b backdrop-blur-2xl transition-all duration-300 ${
          scrolled
            ? "border-slate-200/80 bg-white/90 shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
            : "border-white/70 bg-white/75 shadow-[0_4px_24px_rgba(15,23,42,0.04)]"
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1800px] items-center gap-5 px-4 transition-all duration-300 sm:px-7 ${
            scrolled ? "h-[76px]" : "h-[96px]"
          }`}
        >
          <Link
            aria-label="Gabarit.AI Brasil — página inicial"
            className="flex shrink-0 items-center"
            href="/"
          >
            <BrandMark
              className={scrolled ? "h-16 w-16" : "h-[88px] w-[88px]"}
              size="small"
            />
          </Link>

          <form
            className="mx-auto hidden min-w-0 max-w-2xl flex-1 md:block"
            onSubmit={handleSearch}
            role="search"
          >
            <label className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 shadow-[0_8px_28px_rgba(15,23,42,0.06)] transition-all duration-200 hover:border-blue-200 hover:shadow-[0_12px_32px_rgba(37,99,235,0.10)] focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100/70">
              <Search
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-focus-within:text-blue-600"
              />
              <input
                aria-label="Buscar concurso, cargo, órgão ou cidade"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar concurso, cargo, órgão ou cidade"
                value={query}
              />
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                type="submit"
              >
                Buscar <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </label>
          </form>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" href="#mapa">
              Mapa
            </a>
            <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" href="#concursos">
              Concursos
            </a>
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              onClick={() => chooseState("BR")}
              type="button"
            >
              Federais
            </button>
            <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" href="#mapa">
              Estados
            </a>
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              onClick={() => void showFavoritesList()}
              type="button"
            >
              Favoritos
            </button>
          </nav>
        </div>
        <form className="px-4 pb-3 md:hidden" onSubmit={handleSearch} role="search">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-2.5 shadow-[0_6px_24px_rgba(15,23,42,0.06)] focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100/70">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
            aria-label="Buscar concurso, cargo, órgão ou cidade"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar concurso, cargo, órgão ou cidade"
            value={query}
          />
          </label>
        </form>
      </header>

      <div className="mx-auto max-w-[1800px] px-3 pb-8 pt-[120px] md:px-6 xl:pt-[112px]">
        <section
          className="grid min-h-[calc(100vh-110px)] gap-5 xl:grid-cols-[minmax(0,1fr)_400px]"
          id="mapa"
        >
          <div className="relative flex min-h-[68vh] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/65 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl xl:min-h-[calc(100vh-110px)]">
            <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
              <motion.button
                animate={{ y: [0, -3, 0] }}
                className="group flex max-w-[min(390px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-800 p-3.5 text-left text-white shadow-[0_18px_42px_rgba(30,64,175,0.32)] ring-1 ring-white/20 transition hover:shadow-[0_22px_48px_rgba(30,64,175,0.40)] sm:gap-4 sm:p-4"
                onClick={() => chooseState("BR")}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                type="button"
                whileHover={{ scale: 1.015, y: -2 }}
                whileTap={{ scale: 0.985 }}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 text-2xl ring-1 ring-white/20 backdrop-blur">
                  🇧🇷
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-extrabold sm:text-base">
                    Brasil
                    <span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-100 ring-1 ring-emerald-100/20">
                      Nacional
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-blue-100 sm:text-xs">
                    <AnimatedNumber value={nationalMetrics.count} /> concursos
                    <span className="mx-1.5 text-white/50">·</span>
                    <AnimatedNumber value={nationalMetrics.vacancies} /> vagas
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-cyan-100/90">
                    Maior salário {formatCurrency(nationalMetrics.maxSalary)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 self-center text-[10px] font-bold text-white/90 sm:text-xs">
                  Explorar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </motion.button>
            </div>

            <div className="absolute right-3 top-24 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-[9px] font-semibold text-slate-600 shadow-lg backdrop-blur-xl sm:right-6 sm:top-6 sm:gap-2 sm:text-[10px]">
              <span className="h-3 w-3 rounded-sm bg-slate-200 shadow-inner" /> 0
              <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-green-100 to-green-300" /> 1–10
              <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-green-300 to-green-500" /> 11–30
              <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-green-600 to-green-800" /> 31–100
              <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-blue-500 to-blue-800" /> 101+
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_36%,rgba(59,130,246,0.10),transparent_38%),radial-gradient(circle_at_72%_68%,rgba(34,197,94,0.10),transparent_34%),linear-gradient(145deg,#f8fbff_0%,#ffffff_48%,#f3f8f6_100%)] px-2 pb-10 pt-32 sm:px-8 sm:pt-24">
              <div className="pointer-events-none absolute inset-0 opacity-75">
                <div className="absolute left-[18%] top-[25%] h-56 w-56 rounded-full bg-blue-200/50 blur-[90px]" />
                <div className="absolute bottom-[18%] right-[22%] h-64 w-64 rounded-full bg-emerald-200/45 blur-[100px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
              </div>
              <ComposableMap
                className="relative z-0 h-full max-h-[720px] w-full max-w-[960px] drop-shadow-[0_18px_24px_rgba(15,23,42,0.08)]"
                projection="geoMercator"
                projectionConfig={{ center: [-52, -14], scale: 770 }}
              >
                <defs>
                  <linearGradient id="heat-empty" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#f1f5f9" />
                    <stop offset="100%" stopColor="#cbd5e1" />
                  </linearGradient>
                  <linearGradient id="heat-low" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#dcfce7" />
                    <stop offset="100%" stopColor="#86efac" />
                  </linearGradient>
                  <linearGradient id="heat-medium" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#86efac" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                  <linearGradient id="heat-high" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#15803d" />
                  </linearGradient>
                  <linearGradient id="heat-hot" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                  <linearGradient id="state-hover" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                  <linearGradient id="state-selected" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="55%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#1e3a8a" />
                  </linearGradient>
                </defs>
                <Geographies geography={BRAZIL_GEOJSON}>
                  {({ geographies }) =>
                    geographies.map((geography) => {
                      const uf = getUf(
                        geography.properties as Record<string, unknown>,
                      );
                      const state = states.find((item) => item.uf === uf);
                      const metrics = metricsByUf.get(uf);
                      const isSelected = selectedUf === uf;
                      return (
                        <Geography
                          aria-label={`${state?.nome ?? uf}, ${metrics?.count ?? 0} concursos`}
                          geography={geography}
                          key={geography.rsmKey}
                          onBlur={() => setHoveredUf(null)}
                          onClick={() => uf && chooseState(uf)}
                          onFocus={() => setHoveredUf(uf)}
                          onMouseEnter={() => setHoveredUf(uf)}
                          onMouseMove={(event) =>
                            setPointer({
                              x: event.clientX,
                              y: event.clientY,
                            })
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              if (uf) chooseState(uf);
                            }
                          }}
                          style={{
                            fill:
                              isSelected
                                ? "url(#state-selected)"
                                : hoveredUf === uf
                                  ? "url(#state-hover)"
                                  : heatFill(metrics?.count ?? 0),
                            outline: "none",
                            stroke: isSelected ? "#dbeafe" : "#ffffff",
                            strokeWidth: isSelected ? 2.8 : 1.6,
                            transform:
                              hoveredUf === uf || isSelected
                                ? "scale(1.02)"
                                : "scale(1)",
                            transformBox: "fill-box",
                            transformOrigin: "center",
                            filter: isSelected
                              ? "drop-shadow(0 4px 8px rgba(37,99,235,.42))"
                              : hoveredUf === uf
                                ? "drop-shadow(0 3px 6px rgba(15,23,42,.22))"
                                : "none",
                            transition:
                              "fill 220ms ease, stroke-width 220ms ease, filter 220ms ease, transform 220ms ease",
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>

              {loadingStates && (
                <motion.div
                  animate={{ opacity: [0.65, 1, 0.65] }}
                  className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur-xl"
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Sincronizando mapa
                </motion.div>
              )}

              <AnimatePresence>
                {hoveredState && hoveredMetrics && pointer && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="pointer-events-none fixed z-50 hidden w-72 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.20)] backdrop-blur-2xl sm:block"
                    exit={{ opacity: 0, scale: 0.96, y: 5 }}
                    initial={{ opacity: 0, scale: 0.96, y: 5 }}
                    style={{
                      left: Math.min(pointer.x + 14, window.innerWidth - 275),
                      top: Math.min(pointer.y + 14, window.innerHeight - 190),
                    }}
                  >
                    <p className="flex items-center gap-2 font-bold text-slate-950">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700">
                        <MapPin className="h-4 w-4" />
                      </span>
                      {hoveredState.nome} <span className="text-slate-400">{hoveredState.uf}</span>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Metric
                        icon={Building2}
                        label="Concursos"
                        value={String(hoveredMetrics.count)}
                      />
                      <Metric
                        icon={Landmark}
                        label="Vagas"
                        value={hoveredMetrics.vacancies.toLocaleString("pt-BR")}
                      />
                      <Metric
                        icon={Banknote}
                        label="Maior salário"
                        value={formatCurrency(hoveredMetrics.maxSalary)}
                      />
                      <Metric
                        icon={CalendarDays}
                        label="Próxima prova"
                        value={formatDate(hoveredMetrics.nextExam)}
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-blue-700">
                      Clique para visualizar
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                className="absolute bottom-4 right-4 z-10 rounded-full bg-blue-950 px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-blue-800 xl:hidden"
                onClick={() => setMobilePanelOpen(true)}
                type="button"
              >
                Ver concursos · {selectedUf}
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-white/80 bg-white/65 px-4 py-3 text-[11px] text-slate-500 backdrop-blur sm:px-6">
              <span>
                {selectedUf === "BR"
                  ? "Exibindo oportunidades nacionais"
                  : `Estado selecionado: ${selectedState?.nome ?? selectedUf}`}
              </span>
              <a
                className="font-medium underline"
                href="https://mapsvg.com/maps/brazil"
                rel="noreferrer"
                target="_blank"
              >
                Mapa: MapSVG (CC BY 4.0)
              </a>
            </div>
          </div>

          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/75 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-2xl xl:flex">
            <StatePanel
              state={selectedState}
              uf={selectedUf}
              metrics={selectedMetrics}
              contests={visibleContests}
              loading={loadingContests || searching}
              error={error}
              query={query}
              setQuery={setQuery}
              onSearch={handleSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              levelFilter={levelFilter}
              setLevelFilter={setLevelFilter}
              areaFilter={areaFilter}
              setAreaFilter={setAreaFilter}
              favorites={favorites}
              onFavorite={toggleFavorite}
              onDetails={setDetailContest}
              followed={followedStates.includes(selectedUf)}
              onFollow={toggleFollowState}
              showFavorites={showFavorites}
              onShowFavorites={showFavoritesList}
            />
          </aside>
        </section>

        <section className="mt-8 xl:hidden" id="concursos">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                {selectedState?.regiao ?? "Nacional"} · {selectedUf}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold text-blue-950">
                {selectedState?.nome ?? "Brasil"}
              </h2>
            </div>
            <button
              className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800"
              onClick={toggleFollowState}
              type="button"
            >
              {followedStates.includes(selectedUf)
                ? "Estado seguido"
                : "Seguir estado"}
            </button>
          </div>
          <MobileContestList
            contests={visibleContests}
            loading={loadingContests || searching}
            error={error}
            uf={selectedUf}
            favorites={favorites}
            onFavorite={toggleFavorite}
            onDetails={setDetailContest}
          />
        </section>
      </div>

      <AnimatePresence>
        {mobilePanelOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-slate-950/20 xl:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setMobilePanelOpen(false)}
          >
            <motion.aside
              animate={{ y: 0 }}
              className="absolute inset-x-0 bottom-0 flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/80 bg-white/95 shadow-[0_-24px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
              exit={{ y: "100%" }}
              initial={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              onClick={(event) => event.stopPropagation()}
            >
              <StatePanel
                state={selectedState}
                uf={selectedUf}
                metrics={selectedMetrics}
                contests={visibleContests}
                loading={loadingContests || searching}
                error={error}
                query={query}
                setQuery={setQuery}
                onSearch={handleSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                levelFilter={levelFilter}
                setLevelFilter={setLevelFilter}
                areaFilter={areaFilter}
                setAreaFilter={setAreaFilter}
                favorites={favorites}
                onFavorite={toggleFavorite}
                onDetails={setDetailContest}
                followed={followedStates.includes(selectedUf)}
                onFollow={toggleFollowState}
                showFavorites={showFavorites}
                onShowFavorites={showFavoritesList}
                onClose={() => setMobilePanelOpen(false)}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailContest && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setDetailContest(null)}
          >
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/80 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl sm:p-8"
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-700">
                    <Building2 aria-hidden="true" className="h-4 w-4" />
                    {detailContest.orgao}
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold text-slate-950">
                    {detailContest.concurso_nome}
                  </h2>
                  <p className="mt-2 text-slate-600">{detailContest.cargo}</p>
                </div>
                <button
                  aria-label="Fechar detalhes"
                  className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  onClick={() => setDetailContest(null)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric label="Status" value={statusLabel(detailContest.status)} />
                <Metric label="Vagas" value={String(detailContest.vagas)} />
                <Metric
                  label="Salário máximo"
                  value={formatCurrency(detailContest.salario_max)}
                />
                <Metric label="Banca" value={detailContest.banca ?? "A definir"} />
                <Metric
                  label="Inscrição até"
                  value={formatDate(detailContest.data_fim_inscricao)}
                />
                <Metric
                  label="Data da prova"
                  value={formatDate(detailContest.data_prova)}
                />
                <Metric
                  label="Escolaridade"
                  value={detailContest.nivel ?? "A definir"}
                />
                <Metric label="Área" value={detailContest.area ?? "A definir"} />
              </div>
              {detailContest.resumo && (
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {detailContest.resumo}
                </p>
              )}
              {detailContest.cidade_prova.length > 0 && (
                <p className="mt-4 text-sm text-slate-600">
                  <strong className="text-slate-900">Cidades de prova:</strong>{" "}
                  {detailContest.cidade_prova.join(", ")}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                {detailContest.link_edital && (
                  <a
                    className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-50"
                    href={detailContest.link_edital}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver edital
                  </a>
                )}
                {detailContest.link_inscricao && (
                  <a
                    className="rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
                    href={detailContest.link_inscricao}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Fazer inscrição
                  </a>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div
          className="fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-red-200/80 bg-white/90 px-4 py-3 text-sm text-red-800 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl"
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              aria-label="Fechar aviso"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
              onClick={() => setError("")}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StatePanel({
  state,
  uf,
  metrics,
  contests,
  loading,
  error,
  query,
  setQuery,
  onSearch,
  statusFilter,
  setStatusFilter,
  levelFilter,
  setLevelFilter,
  areaFilter,
  setAreaFilter,
  favorites,
  onFavorite,
  onDetails,
  followed,
  onFollow,
  showFavorites,
  onShowFavorites,
  onClose,
}: {
  state: Estado | undefined;
  uf: string;
  metrics: MapMetrics;
  contests: Concurso[];
  loading: boolean;
  error: string;
  query: string;
  setQuery: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  levelFilter: string;
  setLevelFilter: (value: string) => void;
  areaFilter: string;
  setAreaFilter: (value: string) => void;
  favorites: string[];
  onFavorite: (id: string) => void;
  onDetails: (contest: Concurso) => void;
  followed: boolean;
  onFollow: () => void;
  showFavorites: boolean;
  onShowFavorites: () => void;
  onClose?: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0, x: 14 }}
      key={uf}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 px-5 pb-3 pt-3 text-white sm:px-6 sm:pb-5 sm:pt-5">
        {onClose && (
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30 md:hidden" />
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {uf === "BR" ? "Concursos nacionais" : state?.regiao ?? "Estado"}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white">
              {state?.nome ?? (uf === "BR" ? "Brasil" : uf)}
              {state && (
                <span className="ml-2 rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-blue-100 ring-1 ring-white/10">
                  {uf}
                </span>
              )}
            </h1>
          </div>
          {onClose && (
            <button
              aria-label="Fechar painel"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/10 transition hover:bg-white/20"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-4 sm:gap-2">
          <SummaryMetric
            count={metrics.count}
            icon={Building2}
            label="Concursos"
            value={metrics.count.toLocaleString("pt-BR")}
          />
          <SummaryMetric
            count={metrics.vacancies}
            icon={Landmark}
            label="Vagas"
            value={metrics.vacancies.toLocaleString("pt-BR")}
          />
          <SummaryMetric
            icon={Banknote}
            label="Maior salário"
            value={formatCurrency(metrics.maxSalary)}
          />
          <SummaryMetric
            icon={CalendarDays}
            label="Próxima prova"
            value={formatDate(metrics.nextExam)}
          />
        </div>
        <button
          className={`mt-2.5 w-full rounded-xl px-4 py-2 text-sm font-bold transition sm:mt-3 sm:py-2.5 ${
            followed
              ? "border border-white/20 bg-white/10 text-white hover:bg-white/15"
              : "bg-white text-blue-950 shadow-lg shadow-blue-950/20 hover:-translate-y-0.5 hover:bg-blue-50"
          }`}
          onClick={onFollow}
          type="button"
        >
          {followed ? "Estado seguido ✓" : "＋ Seguir Estado"}
        </button>
      </div>

      <div className="shrink-0 border-b border-slate-200/70 bg-white/75 px-4 py-2 backdrop-blur-xl sm:px-6 sm:py-3">
        <form className="flex gap-2" onSubmit={onSearch} role="search">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100/70">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              aria-label="Buscar concursos"
              className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-slate-400 sm:py-2.5"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cargo, órgão ou cidade"
              value={query}
            />
          </label>
          <button
            className="rounded-xl bg-gradient-to-br from-blue-950 to-blue-800 px-3 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            type="submit"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:mt-3">
          {STATUS_FILTERS.map((filter) => (
            <motion.button
              aria-pressed={statusFilter === filter.value}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                statusFilter === filter.value
                  ? "border-blue-950 bg-blue-950 text-white shadow-md shadow-blue-900/15"
                  : "border-slate-200 bg-white/80 text-slate-600 hover:border-blue-200 hover:text-blue-800"
              }`}
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              {filter.label}
            </motion.button>
          ))}
        </div>
        <div className="mt-1 flex gap-2 overflow-x-auto pb-1 sm:mt-2">
          <select
            aria-label="Filtrar por escolaridade"
            className="max-w-[155px] shrink-0 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
            onChange={(event) => setLevelFilter(event.target.value)}
            value={levelFilter}
          >
            <option value="">Escolaridade</option>
            {LEVEL_FILTERS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por área"
            className="max-w-[145px] shrink-0 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
            onChange={(event) => setAreaFilter(event.target.value)}
            value={areaFilter}
          >
            <option value="">Área</option>
            {AREA_FILTERS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
          <motion.button
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              showFavorites
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white/80 text-slate-600 hover:border-amber-200 hover:text-amber-700"
            }`}
            onClick={() => void onShowFavorites()}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
          >
            <Star className="h-3.5 w-3.5" />
            Favoritos ({favorites.length})
          </motion.button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white/70 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            {showFavorites ? "Seus favoritos" : "Concursos"}
          </h2>
          <span className="text-xs text-slate-500">
            {contests.length} resultado{contests.length === 1 ? "" : "s"}
          </span>
        </div>
        {loading ? (
          <div aria-label="Carregando concursos" className="space-y-3" role="status">
            {Array.from({ length: 3 }, (_, index) => (
              <motion.div
                animate={{ opacity: [0.55, 1, 0.55] }}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
                key={index}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: index * 0.12,
                }}
              >
                <div className="h-3 w-28 rounded bg-slate-200" />
                <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="h-8 rounded-lg bg-slate-100" />
                  <div className="h-8 rounded-lg bg-slate-100" />
                </div>
              </motion.div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-5 text-sm leading-6 text-amber-900 shadow-sm">
            Os dados não puderam ser carregados. Verifique a conexão e as
            permissões de leitura do catálogo no Supabase.
          </div>
        ) : contests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-9 text-center shadow-inner">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-base font-bold text-slate-900">
              {showFavorites
                ? "Nenhum favorito salvo"
                : "Nenhum concurso cadastrado"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {showFavorites
                ? "Toque na estrela de um concurso para salvá-lo nesta sessão."
                : "Quando houver oportunidades verificadas para esta região, elas aparecerão aqui."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {contests.map((contest) => (
              <ContestCard
                contest={contest}
                favorite={favorites.includes(contest.id)}
                key={contest.id}
                onDetails={() => onDetails(contest)}
                onFavorite={() => onFavorite(contest.id)}
                uf={uf}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
  count,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  count?: number;
}) {
  return (
    <motion.div
      className="rounded-xl border border-white/10 bg-white/10 p-3 shadow-inner shadow-white/5 backdrop-blur"
      transition={{ duration: 0.18 }}
      whileHover={{ y: -4, backgroundColor: "rgba(255,255,255,.15)" }}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100/80">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 text-cyan-200" />
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-extrabold text-white">
        {count === undefined ? value : <AnimatedNumber value={count} />}
      </p>
    </motion.div>
  );
}

function MobileContestList({
  contests,
  loading,
  error,
  uf,
  favorites,
  onFavorite,
  onDetails,
}: {
  contests: Concurso[];
  loading: boolean;
  error: string;
  uf: string;
  favorites: string[];
  onFavorite: (id: string) => void;
  onDetails: (contest: Concurso) => void;
}) {
  if (loading) {
    return (
      <div aria-label="Carregando concursos" className="space-y-3" role="status">
        {Array.from({ length: 3 }, (_, index) => (
          <motion.div
            animate={{ opacity: [0.55, 1, 0.55] }}
            className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
            key={index}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: index * 0.12,
            }}
          >
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="h-8 rounded-lg bg-slate-100" />
              <div className="h-8 rounded-lg bg-slate-100" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-5 text-sm text-amber-900 shadow-sm">
        Não foi possível consultar os concursos no Supabase.
      </div>
    );
  }
  if (contests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-500 shadow-inner">
        <Sparkles aria-hidden="true" className="mx-auto h-6 w-6 text-blue-600" />
        <p className="mt-3">Nenhum concurso cadastrado para esta seleção.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {contests.map((contest) => (
        <ContestCard
          contest={contest}
          favorite={favorites.includes(contest.id)}
          key={contest.id}
          onDetails={() => onDetails(contest)}
          onFavorite={() => onFavorite(contest.id)}
          uf={uf}
        />
      ))}
    </div>
  );
}
