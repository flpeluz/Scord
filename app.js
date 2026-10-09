// ==========================================
// CONFIGURAÇÃO DO CLIENTE SUPABASE & CACHE
// ==========================================
const SUPABASE_URL = "https://rpqcochkumiwqhsvaxbn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zes3bxMmZ2T5OCb_6Ep2dA_JlBn8t-I";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CACHE_KEY = "scord_app_cache_v9";
const AUTH_KEY = "scord_membro_logado";
const PIN_SESSION_KEY = "scord_pin_lider_sessao";

let CONFIG_IGREJA = {
  id: null,
  nome: "",
  codigo: "",
  lider_nome: "Liderança",
  status_assinatura: "ativa",
  configurada: false
};

let todasMusicas = [];
let todosMembros = [];
let dadosCompletosMembros = [];
let todasEscalas = [];
let diaAtual = "PROXIMO";
let mesAtual = "TODOS";
let dataCultoAlvo = null;
let dataEquipeEmEdicao = null;
let diaSemanaEquipeEmEdicao = null;
let membroLogado = null;
let isAdmin = false;
let PIN_LIDER_VALIDADO = sessionStorage.getItem(PIN_SESSION_KEY) || null;

// Variáveis do Painel Secreto do Dono
let toquesLogo = 0;
let timerToques = null;
let ultimaChaveGerada = "";
let ultimoClienteGerado = "";
let chaveMasterTemporaria = null;
let MASTER_SECRET_SESSAO = sessionStorage.getItem("scord_master_secret") || null;

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const LISTA_FUNCOES_PURAS = [
  "Violão", "Voz", "Ministração", "Teclado", 
  "Bateria", "Baixo", "Guitarra", "Projeção"
];

// ==========================================
// FUNÇÕES UTILITÁRIAS
// ==========================================
function extrairYouTubeId(url) {
  if (!url) return null;
  const match = url.toString().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

async function buscarTituloYouTube(url) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const json = await res.json();
    return json.title || "Novo Louvor";
  } catch (e) {
    return "Novo Louvor";
  }
}

function gerarSenhaAleatoria() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const array = new Uint32Array(6);
  crypto.getRandomValues(array);
  let resultado = "";
  for (let i = 0; i < 6; i++) {
    resultado += chars.charAt(array[i] % chars.length);
  }
  return resultado;
}

function padronizarMesAno(str) {
  if (!str) return null;
  let s = String(str).trim();

  if (s.includes("GMT") || s.includes("Horário") || s.includes("Thu") || s.includes("Mon") || s.includes("Sun")) {
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      return `${NOMES_MESES[dObj.getMonth()]}/${dObj.getFullYear()}`;
    }
    return null;
  }

  if (s.includes("/")) {
    const partes = s.split("/");
    if (partes.length === 2) {
      let m = partes[0].trim();
      const a = partes[1].trim();
      const mNum = parseInt(m, 10);
      if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
        m = NOMES_MESES[mNum - 1];
      }
      const mCap = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
      return `${mCap}/${a}`;
    }
  }
  return null;
}

function parseDataInfo(dataStr) {
  if (!dataStr) return { formatada: "", mesAno: "", chaveOrdenacao: 0, dateObj: null };
  const str = String(dataStr).trim();

  let d = 0, m = 0, a = 0;
  if (str.includes("/")) {
    const partes = str.split("/");
    d = parseInt(partes[0], 10);
    m = parseInt(partes[1], 10);
    a = parseInt(partes[2], 10);
  } else if (str.includes("-")) {
    const limpa = str.includes("T") ? str.split("T")[0] : str;
    const partes = limpa.split("-");
    a = parseInt(partes[0], 10);
    m = parseInt(partes[1], 10);
    d = parseInt(partes[2], 10);
  }

  if (!d || !m || !a) return { formatada: str, mesAno: "Outros", chaveOrdenacao: 0, dateObj: null };

  const dFormatado = String(d).padStart(2, '0');
  const mFormatado = String(m).padStart(2, '0');
  const nomeMes = NOMES_MESES[m - 1] || `Mês ${m}`;

  return {
    formatada: `${dFormatado}/${mFormatado}/${a}`,
    mesAno: `${nomeMes}/${a}`,
    chaveOrdenacao: (a * 10000) + (m * 100) + d,
    dateObj: new Date(a, m - 1, d)
  };
}

function obterCampo(obj, termos) {
  const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const termosNorm = termos.map(normalizar);

  for (const chave in obj) {
    const chaveNorm = normalizar(chave);
    if (termosNorm.includes(chaveNorm) && obj[chave] !== "" && obj[chave] !== null && obj[chave] !== undefined) {
      return obj[chave];
    }
  }
  return "";
}

// ==========================================
// PAINEL SECRETO DO DONO (SEMPRE PEDE SENHA)
// ==========================================

function detectarToquesDono() {
  toquesLogo++;
  clearTimeout(timerToques);
  timerToques = setTimeout(() => { toquesLogo = 0; }, 1500);

  if (toquesLogo >= 5) {
    toquesLogo = 0;
    abrirPainelDono();
  }
}

function abrirPainelDono() {
  const pass = prompt("Acesso Master do Dono do Scord:");
  if (!pass) return;

  chaveMasterTemporaria = pass.trim();

  // Limpa os campos antes de exibir
  document.getElementById("dono-input-cliente").value = "";
  const boxResultado = document.getElementById("box-resultado-chave");
  if (boxResultado) boxResultado.classList.add("hidden");

  document.getElementById("modal-dono-chaves").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function fecharPainelDono() {
  document.getElementById("modal-dono-chaves").classList.add("hidden");
  // Destrói a chave da memória imediatamente ao fechar
  chaveMasterTemporaria = null;
  document.getElementById("dono-input-cliente").value = "";
  const boxResultado = document.getElementById("box-resultado-chave");
  if (boxResultado) boxResultado.classList.add("hidden");
}

async function gerarChaveClienteDono(e) {
  e.preventDefault();
  const inputCliente = document.getElementById("dono-input-cliente");
  const clienteNome = inputCliente.value.trim();
  if (!clienteNome) return;

  if (!chaveMasterTemporaria) {
    alert("Sessão master expirada. Digite a senha novamente.");
    fecharPainelDono();
    return;
  }

  const btn = document.getElementById("btn-dono-gerar");
  btn.disabled = true;
  btn.innerText = "A gerar chave...";

  try {
    const { data, error } = await db.rpc('gerar_chave_mestre_app', {
      p_master_key: chaveMasterTemporaria,
      p_cliente_nome: clienteNome
    });

    if (error || !data || !data.sucesso) {
      alert("Erro: " + ((data && data.erro) || error?.message || "Senha master incorreta."));
      fecharPainelDono();
      return;
    }

    ultimaChaveGerada = data.chave;
    ultimoClienteGerado = clienteNome;

    document.getElementById("label-chave-gerada").innerText = ultimaChaveGerada;
    document.getElementById("box-resultado-chave").classList.remove("hidden");
    inputCliente.value = "";

    compartilharUltimaChaveZap();

  } catch (err) {
    console.error(err);
    alert("Falha de comunicação.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Gerar Chave e Enviar Zap</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

function compartilharUltimaChaveZap() {
  if (!ultimaChaveGerada) return;

  let texto = `*Acesso Oficial - Scord Gestão de Louvor*\n\n`;
  texto += `Olá, ${ultimoClienteGerado}!\n`;
  texto += `Aqui está a sua chave exclusiva de ativação para configurar a sua igreja no Scord:\n\n`;
  texto += `🔑 *Chave de Ativação:* ${ultimaChaveGerada}\n`;
  texto += `🔗 *Link:* ${window.location.origin}\n\n`;
  texto += `_Ao abrir o link, clique em "Primeiro acesso? Configurar novo ministério", insira esta chave e defina o código e os acessos da sua equipa._`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

// ==========================================
// CONFIGURAÇÃO INICIAL (SETUP DO MINISTÉRIO)
// ==========================================
async function executarSetupInicial(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-setup");
  btn.disabled = true;
  btn.innerText = "A configurar no banco de dados...";

  const chave = document.getElementById("setup-input-chave").value.trim();
  const nomeIgreja = document.getElementById("setup-input-nome-igreja").value.trim();
  const sigla = document.getElementById("setup-input-sigla").value.trim().toUpperCase().replace(/\s+/g, '-');
  const liderNome = document.getElementById("setup-input-lider-nome").value.trim();
  const senhaLider = document.getElementById("setup-input-senha").value.trim();
  const pinLider = document.getElementById("setup-input-pin").value.trim();

  try {
    const { data, error } = await db.rpc('inicializar_igreja', {
      p_setup_key: chave,
      p_nome_igreja: nomeIgreja,
      p_codigo: sigla,
      p_lider_nome: liderNome,
      p_senha_lider: senhaLider,
      p_pin_lider: pinLider
    });

    if (error || !data || !data.sucesso) {
      alert("Falha no cadastro: " + ((data && data.erro) || error?.message));
      return;
    }

    alert(`Ministério "${nomeIgreja}" criado com sucesso!\nCódigo da Igreja: ${sigla}\nFaça o login com o seu nome e palavra-passe.`);

    document.getElementById("modal-setup-inicial").classList.add("hidden");
    document.getElementById("login-input-igreja").value = sigla;
    document.getElementById("login-input-nome").value = liderNome;
    document.getElementById("login-input-senha").value = "";
    document.getElementById("login-input-senha").focus();

  } catch (err) {
    console.error(err);
    alert("Erro na conexão com o banco.");
  } finally {
    btn.disabled = false;
    btn.innerText = "Criar Ministério e Iniciar";
    if (window.lucide) lucide.createIcons();
  }
}

// ==========================================
// AUTENTICAÇÃO E SESSÃO
// ==========================================
async function verificarSessaoInicial() {
  const sessaoSalva = localStorage.getItem(AUTH_KEY);
  if (sessaoSalva) {
    try {
      membroLogado = JSON.parse(sessaoSalva);
      CONFIG_IGREJA = {
        id: membroLogado.igreja_id,
        codigo: membroLogado.igreja,
        nome: membroLogado.igreja_nome || membroLogado.igreja,
        configurada: true
      };

      if (PIN_LIDER_VALIDADO) {
        isAdmin = true;
      }

      aplicarSessaoMembro();
      await carregarRepertorio(false);
      return;
    } catch (e) {
      console.error("Erro na leitura da sessão:", e);
    }
  }

  exibirTelaLogin();
}

function exibirTelaLogin() {
  document.getElementById("tela-login").classList.remove("hidden");
  document.getElementById("conteudo-app").classList.add("hidden");

  const inputSenha = document.getElementById("login-input-senha");
  const inputNome = document.getElementById("login-input-nome");
  if (inputSenha) inputSenha.value = "";
  if (inputNome) inputNome.value = "";

  const inputIgreja = document.getElementById("login-input-igreja");
  if (inputIgreja && CONFIG_IGREJA.codigo) {
    inputIgreja.value = CONFIG_IGREJA.codigo;
  }
  if (window.lucide) lucide.createIcons();
}

async function autenticarMembro(e) {
  e.preventDefault();
  const igrejaInput = document.getElementById("login-input-igreja").value.trim().toUpperCase().replace(/\s+/g, '-');
  const nomeInput = document.getElementById("login-input-nome").value.trim();
  const senhaInput = document.getElementById("login-input-senha").value.trim();

  const btn = document.getElementById("btn-submit-login");
  btn.disabled = true;
  btn.innerHTML = `<span>A verificar credenciais...</span>`;

  try {
    const { data, error } = await db.rpc('login_membro', {
      p_igreja_codigo: igrejaInput,
      p_nome: nomeInput,
      p_senha: senhaInput
    });

    if (error || !data || !data.sucesso) {
      alert((data && data.erro) || "Credenciais inválidas. Verifique os dados inseridos.");
      return;
    }

    document.getElementById("login-input-senha").value = "";

    membroLogado = {
      id: data.id,
      nome: data.nome,
      is_lider: data.is_lider,
      igreja_id: data.igreja_id,
      igreja: data.igreja_codigo,
      igreja_nome: data.igreja_nome,
      primeiro_acesso: data.primeiro_acesso
    };

    CONFIG_IGREJA = {
      id: data.igreja_id,
      codigo: data.igreja_codigo,
      nome: data.igreja_nome,
      status_assinatura: data.status_assinatura,
      configurada: true
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(membroLogado));

    if (data.primeiro_acesso) {
      document.getElementById("tela-login").classList.add("hidden");
      document.getElementById("modal-troca-senha-obrigatoria").classList.remove("hidden");
      return;
    }

    aplicarSessaoMembro();
    await carregarRepertorio(false);

  } catch (err) {
    console.error("Erro na autenticação:", err);
    alert("Falha na comunicação com o banco.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Aceder ao Scord</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
    if (window.lucide) lucide.createIcons();
  }
}

async function salvarNovaSenhaPrimeiroAcesso(e) {
  e.preventDefault();
  const inputNova = document.getElementById("primeiro-input-senha-nova");
  const inputConfirma = document.getElementById("primeiro-input-senha-confirma");
  const senhaNova = inputNova.value.trim();

  if (senhaNova !== inputConfirma.value.trim()) {
    alert("As palavras-passe não coincidem.");
    return;
  }

  const { data, error } = await db.rpc('salvar_nova_senha_primeiro_acesso', {
    p_membro_id: membroLogado.id,
    p_senha_nova: senhaNova
  });

  if (error || !data || !data.sucesso) {
    alert("Erro: " + ((data && data.erro) || error?.message));
    return;
  }

  membroLogado.primeiro_acesso = false;
  localStorage.setItem(AUTH_KEY, JSON.stringify(membroLogado));
  document.getElementById("modal-troca-senha-obrigatoria").classList.add("hidden");
  aplicarSessaoMembro();
  await carregarRepertorio(false);
  alert("Palavra-passe pessoal definida com sucesso!");
}

function aplicarSessaoMembro() {
  if (membroLogado) {
    document.getElementById("identificacao-usuario").innerText = `${membroLogado.nome} • ${CONFIG_IGREJA.codigo || 'Scord'}`;
    const lblSessao = document.getElementById("label-sessao-usuario");
    if (lblSessao) lblSessao.innerText = `${membroLogado.nome} (${CONFIG_IGREJA.codigo || 'Scord'})`;
  }
  document.getElementById("tela-login").classList.add("hidden");
  document.getElementById("bloqueio-assinatura").classList.add("hidden");
  document.getElementById("conteudo-app").classList.remove("hidden");
  atualizarInterfaceAdmin();
}

function deslogarMembro() {
  if (confirm("Deseja terminar a sessão neste aparelho?")) {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem("scord_admin_ativo");
    sessionStorage.removeItem(PIN_SESSION_KEY);
    membroLogado = null;
    isAdmin = false;
    PIN_LIDER_VALIDADO = null;

    const formLogin = document.getElementById("form-login-membro");
    if (formLogin) formLogin.reset();

    document.getElementById("conteudo-app").classList.add("hidden");
    document.getElementById("bloqueio-assinatura").classList.add("hidden");
    exibirTelaLogin();
  }
}

function bloquearAcessoInadimplente(msg) {
  document.getElementById("msg-bloqueio").innerText = msg;
  document.getElementById("bloqueio-assinatura").classList.remove("hidden");
  document.getElementById("conteudo-app").classList.add("hidden");
  document.getElementById("tela-login").classList.add("hidden");
  if (window.lucide) lucide.createIcons();
}

// ==========================================
// CADEADO & ACESSO DA LIDERANÇA
// ==========================================
async function alternarModoAdmin() {
  if (isAdmin) {
    if (confirm("Deseja fechar o painel de liderança e voltar ao modo músico?")) {
      isAdmin = false;
      PIN_LIDER_VALIDADO = null;
      sessionStorage.removeItem(PIN_SESSION_KEY);
      atualizarInterfaceAdmin();
      renderizarCards();
      renderizarVisualizacaoEscalaMensal();
    }
  } else {
    const pin = prompt("Área reservada à liderança. Digite o PIN do cadeado:");
    if (!pin) return;

    try {
      const { data, error } = await db.rpc('validar_pin_lideranca', {
        p_igreja_id: CONFIG_IGREJA.id,
        p_pin: pin.trim()
      });

      if (error || !data || !data.sucesso) {
        alert("PIN incorreto.");
        return;
      }

      isAdmin = true;
      PIN_LIDER_VALIDADO = pin.trim();
      sessionStorage.setItem(PIN_SESSION_KEY, PIN_LIDER_VALIDADO);

      atualizarInterfaceAdmin();
      renderizarCards();
      renderizarVisualizacaoEscalaMensal();
    } catch (e) {
      console.error(e);
      alert("Erro ao verificar PIN da liderança.");
    }
  }
}

function atualizarInterfaceAdmin() {
  const btnLock = document.getElementById("icon-lock");
  const painelAdmin = document.getElementById("painel-botoes-admin");

  if (isAdmin) {
    btnLock.setAttribute("data-lucide", "unlock");
    btnLock.className = "w-4 h-4 text-emerald-400";
    painelAdmin.classList.remove("hidden");
    painelAdmin.classList.add("flex");
  } else {
    btnLock.setAttribute("data-lucide", "lock");
    btnLock.className = "w-4 h-4 text-slate-400";
    painelAdmin.classList.add("hidden");
    painelAdmin.classList.remove("flex");
  }
  if (window.lucide) lucide.createIcons();
}

// ==========================================
// DISPAROS DE WHATSAPP (COM CÓDIGO DA IGREJA)
// ==========================================
function dispararAcessoWhatsApp(nome, senhaProvisoria) {
  const igrejaCodigo = CONFIG_IGREJA.codigo || "SCORD";
  let texto = `*Acesso ao Scord - Ministério de Louvor* \n\n`;
  texto += `Olá, *${nome}*! Segue o teu acesso individual ao aplicativo de louvor e escalas:\n\n`;
  texto += `🔗 *Link:* ${window.location.origin}\n`;
  texto += `⛪ *Código da Igreja:* ${igrejaCodigo}\n`;
  texto += `👤 *Nome:* ${nome}\n`;
  texto += `🔑 *Palavra-passe Temporária:* ${senhaProvisoria}\n\n`;
  texto += `_No primeiro acesso, a aplicação solicitará a criação da tua palavra-passe definitiva._`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

function enviarLembreteCultoWhatsApp(dataCulto, diaSemana) {
  if (!isAdmin) {
    alert("Apenas a liderança pode disparar lembretes no WhatsApp.");
    return;
  }

  const louvoresDesteCulto = todasMusicas.filter(m => parseDataInfo(obterCampo(m, ["data", "date"])).formatada === dataCulto);

  let integrantesStr = "";
  const esc = todasEscalas.find(e => e.data === dataCulto);
  if (esc && esc.integrantes) {
    integrantesStr = esc.integrantes;
  } else if (louvoresDesteCulto.length > 0) {
    integrantesStr = obterCampo(louvoresDesteCulto[0], ["integrantes", "escala", "equipe"]) || "";
  }

  let texto = `*Lembrete de Ensaio e Culto - ${diaSemana} (${dataCulto})* \n\n`;
  texto += `Lembrando a todos que temos ensaio antes do início do culto. Não se atrasem!\n\n`;

  if (integrantesStr) {
    const listaFormatada = integrantesStr
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => `• ${item}`)
      .join('\n');

    texto += `👥 *Escala de Hoje:*\n${listaFormatada}\n\n`;
  }

  texto += `Cifras, letras e áudios disponíveis no app Scord:\n${window.location.origin}`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

function dispararZapEscalaIndividual(nomeMembro) {
  if (!isAdmin) {
    alert("Apenas a liderança pode disparar escalas no WhatsApp.");
    return;
  }
  if (!nomeMembro || nomeMembro === "TODOS") return;

  const mesAtualNormalizado = mesAtual.trim().toLowerCase();
  const escalasDoMembro = [];

  todasEscalas.forEach(esc => {
    const mesEscala = (padronizarMesAno(esc.mes_ano) || "").trim().toLowerCase();
    const info = parseDataInfo(esc.data);
    const mesInfo = info.mesAno.trim().toLowerCase();

    if (mesAtual === "TODOS" || mesEscala === mesAtualNormalizado || mesInfo === mesAtualNormalizado) {
      if (esc.integrantes && esc.integrantes.toLowerCase().includes(nomeMembro.toLowerCase())) {
        const match = esc.integrantes.match(new RegExp(`${nomeMembro}\\s*\\(([^)]+)\\)`, "i"));
        const funcao = match ? match[1] : "Ministério";
        escalasDoMembro.push({
          data: esc.data,
          dia: esc.dia,
          funcao: funcao,
          ordem: info.chaveOrdenacao
        });
      }
    }
  });

  if (escalasDoMembro.length === 0) {
    alert(`${nomeMembro} não possui datas escaladas neste mês.`);
    return;
  }

  escalasDoMembro.sort((a, b) => a.ordem - b.ordem);

  let texto = `*Paz, ${nomeMembro}!* \n\n`;
  texto += `Segue a tua escala de louvor para *${mesAtual}*:\n\n`;

  escalasDoMembro.forEach(item => {
    texto += `*${item.data} (${item.dia})* - ${item.funcao}\n`;
  });

  texto += `\nConsulte cifras e repertório completo na aplicação Scord:\n${window.location.origin}`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

function dispararZapEscalaFiltrada() {
  const seletor = document.getElementById("seletor-filtro-musico");
  if (seletor && seletor.value && seletor.value !== "TODOS") {
    dispararZapEscalaIndividual(seletor.value);
  }
}

// ==========================================
// DEFINIÇÕES E GESTÃO DA LIDERANÇA
// ==========================================
function abrirModalConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.remove("hidden");
}

function fecharModalConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.add("hidden");
  document.getElementById("input-pin-novo").value = "";
}

async function salvarNovoPinAdmin() {
  const input = document.getElementById("input-pin-novo");
  const novoPin = input.value.trim();

  const { data, error } = await db.rpc('atualizar_pin_admin_seguro', {
    p_igreja_id: CONFIG_IGREJA.id,
    p_pin_atual: PIN_LIDER_VALIDADO,
    p_novo_pin: novoPin
  });

  if (error || !data || !data.sucesso) {
    alert("Erro ao gravar PIN: " + ((data && data.erro) || error?.message));
  } else {
    PIN_LIDER_VALIDADO = novoPin;
    sessionStorage.setItem(PIN_SESSION_KEY, novoPin);
    alert("PIN do cadeado atualizado com sucesso!");
    fecharModalConfiguracoes();
  }
}

// ==========================================
// CONSULTA DE ESCALAS MENSAIS (LÍDER VS MÚSICO)
// ==========================================
function abrirModalConsultaEscala() {
  const seletor = document.getElementById("seletor-filtro-musico");

  const membrosUnicos = new Set(todosMembros);
  todasEscalas.forEach(esc => {
    const partes = (esc.integrantes || "").split(",");
    partes.forEach(p => {
      const nomeMatch = p.trim().match(/^([^(]+)/);
      if (nomeMatch && nomeMatch[1].trim()) membrosUnicos.add(nomeMatch[1].trim());
    });
  });

  const lista = Array.from(membrosUnicos).sort();

  if (isAdmin) {
    seletor.disabled = false;
    seletor.classList.remove("opacity-60", "cursor-not-allowed");
    seletor.innerHTML = `<option value="TODOS">Equipa Completa (Todos os Cultos)</option>` + 
      lista.map(m => `<option value="${m}">${m}</option>`).join("");

    if (membroLogado && lista.includes(membroLogado.nome)) {
      seletor.value = membroLogado.nome;
    } else {
      seletor.value = "TODOS";
    }
  } else {
    const nomeUsuario = membroLogado ? membroLogado.nome : (lista[0] || "Músico");
    seletor.innerHTML = `<option value="${nomeUsuario}">${nomeUsuario} (Minha Escala)</option>`;
    seletor.value = nomeUsuario;
    seletor.disabled = true;
    seletor.classList.add("opacity-60", "cursor-not-allowed");
  }

  document.getElementById("label-mes-consulta-sub").innerText = `Mês: ${mesAtual}`;
  document.getElementById("modal-consulta-escala").classList.remove("hidden");
  renderizarVisualizacaoEscalaMensal();
}
  
function fecharModalConsultaEscala() {
  document.getElementById("modal-consulta-escala").classList.add("hidden");
}

function renderizarVisualizacaoEscalaMensal() {
  const seletor = document.getElementById("seletor-filtro-musico");
  const filtro = seletor ? seletor.value : "TODOS";
  const container = document.getElementById("container-dias-escala-mensal");
  const btnZap = document.getElementById("btn-zap-consulta-individual");
  const mesAtualNormalizado = (mesAtual || "").trim().toLowerCase();

  if (btnZap) {
    if (isAdmin && filtro !== "TODOS") {
      btnZap.classList.remove("hidden");
      btnZap.classList.add("flex");
    } else {
      btnZap.classList.add("hidden");
      btnZap.classList.remove("flex");
    }
  }

  const escalasFiltradas = todasEscalas.filter(item => {
    const mesEscala = (padronizarMesAno(item.mes_ano) || "").trim().toLowerCase();
    const info = parseDataInfo(item.data);
    const mesInfo = (info.mesAno || "").trim().toLowerCase();
    return (mesAtual === "TODOS" || mesEscala === mesAtualNormalizado || mesInfo === mesAtualNormalizado);
  });
  
  if (escalasFiltradas.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">Nenhuma escala registada para ${mesAtual}.</p>`;
    return;
  }

  escalasFiltradas.sort((a, b) => parseDataInfo(a.data).chaveOrdenacao - parseDataInfo(b.data).chaveOrdenacao);

  let html = "";
  escalasFiltradas.forEach(esc => {
    const integrantes = esc.integrantes || "";
    const estaNoCulto = (filtro === "TODOS") || integrantes.toLowerCase().includes(filtro.toLowerCase());

    if (estaNoCulto) {
      let textoExibicao = integrantes;

      if (filtro !== "TODOS") {
        const regex = new RegExp(`(${filtro}\\s*\\([^)]+\\))`, "i");
        const match = integrantes.match(regex);
        textoExibicao = match 
          ? `<span class="text-emerald-400 font-bold">${match[1]}</span>` 
          : `<span class="text-emerald-400 font-semibold">${filtro}</span>`;
      }

      html += `
        <div class="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-indigo-300 uppercase">${esc.dia} • ${esc.data}</span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed font-medium">${textoExibicao}</p>
        </div>
      `;
    }
  });
  
  if (!html) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">${filtro} não possui escalas agendadas para ${mesAtual}.</p>`;
  } else {
    container.innerHTML = html;
  }
}

// ==========================================
// ESCALAÇÃO DE CULTOS
// ==========================================
async function abrirModalEscalarCulto() {
  // Se a lista estiver vazia na memória, tenta carregar imediatamente do banco
  if (todosMembros.length === 0 && CONFIG_IGREJA.id) {
    const { data: membros } = await db
      .from("membros")
      .select("nome")
      .eq("igreja_id", CONFIG_IGREJA.id)
      .order("nome", { ascending: true });

    if (membros && membros.length > 0) {
      todosMembros = membros.map(m => m.nome);
    }
  }

  if (todosMembros.length === 0) {
    alert("Registe integrantes no botão 'Músicos' primeiro.");
    return;
  }

  const inputData = document.getElementById("escala-input-data");
  const hoje = new Date().toISOString().split("T")[0];
  inputData.value = hoje;
  aoMudarDataEscalaCulto(hoje);

  document.getElementById("modal-escalar-culto").classList.remove("hidden");
}

function fecharModalEscalarCulto() {
  document.getElementById("modal-escalar-culto").classList.add("hidden");
}

function aoMudarDataEscalaCulto(dataIso) {
  if (!dataIso) return;
  const [ano, mes, dia] = dataIso.split("-");
  const dObj = new Date(ano, mes - 1, dia);
  const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const diaSemana = nomesDias[dObj.getDay()];
  document.getElementById("escala-input-dia").value = diaSemana;

  const dataFmt = `${dia}/${mes}/${ano}`;
  carregarMembrosParaDataCulto(dataFmt);
}

function carregarMembrosParaDataCulto(dataFmt) {
  const container = document.getElementById("container-membros-escala-culto");
  const esc = todasEscalas.find(e => e.data === dataFmt);
  const integrantesStr = esc ? (esc.integrantes || "") : "";

  const optsFuncoes1 = LISTA_FUNCOES_PURAS.map(f => `<option value="${f}">${f}</option>`).join("");
  const optsFuncoes2 = `<option value="">(Nenhuma)</option>` + LISTA_FUNCOES_PURAS.map(f => `<option value="${f}">+ ${f}</option>`).join("");

  container.innerHTML = todosMembros.map((nome, idx) => {
    const estaMarcado = integrantesStr.toLowerCase().includes(nome.toLowerCase());
    return `
      <div class="flex items-center gap-2 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/40">
        <input type="checkbox" id="check-culto-membro-${idx}" value="${nome}" ${estaMarcado ? "checked" : ""} class="check-membro-culto-data w-4 h-4 rounded accent-amber-500 shrink-0 cursor-pointer" />
        <label for="check-culto-membro-${idx}" class="text-xs text-slate-100 font-semibold flex-1 cursor-pointer truncate">${nome}</label>
        <select id="funcao1-culto-membro-${idx}" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-amber-300 font-semibold outline-none">
          ${optsFuncoes1}
        </select>
        <select id="funcao2-culto-membro-${idx}" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-400 outline-none">
          ${optsFuncoes2}
        </select>
      </div>
    `;
  }).join("");

  todosMembros.forEach((nome, idx) => {
    const s1 = document.getElementById(`funcao1-culto-membro-${idx}`);
    const s2 = document.getElementById(`funcao2-culto-membro-${idx}`);
    if (integrantesStr.toLowerCase().includes(nome.toLowerCase())) {
      const match = integrantesStr.match(new RegExp(`${nome}\\s*\\(([^)]+)\\)`, "i"));
      if (match) {
        const funcoes = match[1].split("+").map(s => s.trim());
        if (s1 && funcoes[0]) s1.value = funcoes[0];
        if (s2 && funcoes[1]) s2.value = funcoes[1];
      }
    }
  });
}

function marcarTodosMembrosEscala(marcar = false) {
  document.querySelectorAll(".check-membro-culto-data").forEach(chk => chk.checked = marcar);
}

async function salvarEscalaCultoData(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-escala-culto");
  btn.disabled = true;
  btn.innerText = "A guardar culto...";

  const dataIso = document.getElementById("escala-input-data").value;
  const [ano, mes, dia] = dataIso.split("-");
  const dataFmt = `${dia}/${mes}/${ano}`;
  const diaSemana = document.getElementById("escala-input-dia").value;
  const mesAno = `${NOMES_MESES[parseInt(mes, 10) - 1]}/${ano}`;

  const lista = [];
  document.querySelectorAll(".check-membro-culto-data").forEach((chk, idx) => {
    if (chk.checked) {
      const nome = chk.value;
      const f1 = document.getElementById(`funcao1-culto-membro-${idx}`).value;
      const f2 = document.getElementById(`funcao2-culto-membro-${idx}`).value;
      const funcaoFinal = f2 ? `${f1} + ${f2}` : f1;
      lista.push(`${nome} (${funcaoFinal})`);
    }
  });
  const equipeTexto = lista.join(", ");

  try {
    const { data: existente } = await db
      .from("escalas")
      .select("id")
      .eq("data", dataFmt)
      .eq("igreja_id", CONFIG_IGREJA.id)
      .maybeSingle();

    if (existente && existente.id) {
      await db
        .from("escalas")
        .update({
          dia: diaSemana,
          mes_ano: mesAno,
          integrantes: equipeTexto,
          igreja: CONFIG_IGREJA.codigo
        })
        .eq("id", existente.id);
    } else {
      await db
        .from("escalas")
        .insert([{
          data: dataFmt,
          dia: diaSemana,
          mes_ano: mesAno,
          integrantes: equipeTexto,
          igreja: CONFIG_IGREJA.codigo,
          igreja_id: CONFIG_IGREJA.id
        }]);
    }

    await db
      .from("musicas")
      .update({ integrantes: equipeTexto })
      .eq("data", dataFmt)
      .eq("igreja_id", CONFIG_IGREJA.id);

    fecharModalEscalarCulto();
    await carregarRepertorio(true);
    alert(`Culto de ${diaSemana} (${dataFmt}) guardado com sucesso!`);
  } catch (err) {
    console.error("Erro ao gravar escala:", err);
    alert("Erro ao gravar escala.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Guardar Culto na Programação`;
    if (window.lucide) lucide.createIcons();
  }
}

// ==========================================
// EDIÇÃO PONTUAL DE EQUIPE
// ==========================================
function abrirModalEditarEquipeDia(dataTexto, diaSemana) {
  dataEquipeEmEdicao = dataTexto;
  diaSemanaEquipeEmEdicao = diaSemana;
  document.getElementById("label-equipe-dia-edicao").innerText = `${diaSemana} • ${dataTexto}`;
  document.getElementById("modal-editar-equipe-dia").classList.remove("hidden");

  const esc = todasEscalas.find(e => e.data === dataTexto);
  let integrantesStr = esc ? esc.integrantes : "";
  if (!integrantesStr) {
    const m = todasMusicas.find(m => parseDataInfo(obterCampo(m, ["data", "date"])).formatada === dataTexto);
    if (m) integrantesStr = obterCampo(m, ["integrantes", "escala", "equipe"]) || "";
  }

  const optsFuncoes1 = LISTA_FUNCOES_PURAS.map(f => `<option value="${f}">${f}</option>`).join("");
  const optsFuncoes2 = `<option value="">(Nenhuma)</option>` + LISTA_FUNCOES_PURAS.map(f => `<option value="${f}">+ ${f}</option>`).join("");

  const container = document.getElementById("lista-membros-equipe-dia");
  container.innerHTML = todosMembros.map((nome, idx) => {
    const estaMarcado = integrantesStr.toLowerCase().includes(nome.toLowerCase());
    return `
      <div class="flex items-center gap-2 bg-slate-800/60 p-2 rounded-xl">
        <input type="checkbox" id="check-eq-dia-${idx}" value="${nome}" ${estaMarcado ? "checked" : ""} class="check-membro-equipe-dia w-4 h-4 rounded accent-emerald-500" />
        <label for="check-eq-dia-${idx}" class="text-xs text-slate-200 font-semibold flex-1 cursor-pointer truncate">${nome}</label>
        <select id="funcao1-eq-dia-${idx}" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none">
          ${optsFuncoes1}
        </select>
        <select id="funcao2-eq-dia-${idx}" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-400 outline-none">
          ${optsFuncoes2}
        </select>
      </div>
    `;
  }).join("");

  todosMembros.forEach((nome, idx) => {
    const s1 = document.getElementById(`funcao1-eq-dia-${idx}`);
    const s2 = document.getElementById(`funcao2-eq-dia-${idx}`);
    if (integrantesStr.toLowerCase().includes(nome.toLowerCase())) {
      const match = integrantesStr.match(new RegExp(`${nome}\\s*\\(([^)]+)\\)`, "i"));
      if (match) {
        const funcoes = match[1].split("+").map(s => s.trim());
        if (s1 && funcoes[0]) s1.value = funcoes[0];
        if (s2 && funcoes[1]) s2.value = funcoes[1];
      }
    }
  });
  if (window.lucide) lucide.createIcons();
}

function fecharModalEditarEquipeDia() {
  document.getElementById("modal-editar-equipe-dia")?.classList.add("hidden");
}

async function salvarAlteracaoEquipeDia() {
  const btn = document.getElementById("btn-salvar-equipe-dia");
  btn.disabled = true;
  btn.innerText = "A atualizar equipe...";

  const lista = [];
  document.querySelectorAll(".check-membro-equipe-dia").forEach((chk, idx) => {
    if (chk.checked) {
      const nome = chk.value;
      const f1 = document.getElementById(`funcao1-eq-dia-${idx}`)?.value || "Voz";
      const f2 = document.getElementById(`funcao2-eq-dia-${idx}`)?.value || "";
      const funcaoFinal = f2 ? `${f1} + ${f2}` : f1;
      lista.push(`${nome} (${funcaoFinal})`);
    }
  });

  const equipeTexto = lista.join(", ");
  const info = parseDataInfo(dataEquipeEmEdicao);

  try {
    const { data: existente } = await db
      .from("escalas")
      .select("id")
      .eq("data", dataEquipeEmEdicao)
      .eq("igreja_id", CONFIG_IGREJA.id)
      .maybeSingle();

    if (existente && existente.id) {
      await db
        .from("escalas")
        .update({
          integrantes: equipeTexto,
          igreja: CONFIG_IGREJA.codigo
        })
        .eq("id", existente.id);
    } else {
      await db
        .from("escalas")
        .insert([{
          data: dataEquipeEmEdicao,
          dia: diaSemanaEquipeEmEdicao,
          mes_ano: info.mesAno,
          integrantes: equipeTexto,
          igreja: CONFIG_IGREJA.codigo,
          igreja_id: CONFIG_IGREJA.id
        }]);
    }

    await db
      .from("musicas")
      .update({ integrantes: equipeTexto })
      .eq("data", dataEquipeEmEdicao)
      .eq("igreja_id", CONFIG_IGREJA.id);

    fecharModalEditarEquipeDia();
    await carregarRepertorio(true);
  } catch (err) {
    console.error("Erro ao atualizar equipe:", err);
    alert("Erro ao guardar alterações da equipe.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Atualizar Equipe`;
    if (window.lucide) lucide.createIcons();
  }
}

// ==========================================
// GESTÃO DE LOUVORES
// ==========================================
function abrirModalNovoLouvor() {
  document.getElementById("modal-louvor").classList.remove("hidden");
}

function fecharModalNovoLouvor() {
  document.getElementById("modal-louvor").classList.add("hidden");
  document.getElementById("form-louvor").reset();
}

function calcularDiaSemana(dataStr) {
  if (!dataStr) return;
  const [ano, mes, dia] = dataStr.split("-");
  const dataObj = new Date(ano, mes - 1, dia);
  const diasSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  document.getElementById("input-dia").value = diasSemana[dataObj.getDay()];
}

async function salvarNovoLouvor(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-louvor");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A gravar louvor...`;
  if (window.lucide) lucide.createIcons();

  const dataCrua = document.getElementById("input-data").value;
  const [ano, mes, dia] = dataCrua.split("-");
  const dataFormatada = `${dia}/${mes}/${ano}`;
  const linkYt = document.getElementById("input-yt").value.trim();

  const tituloExtraido = await buscarTituloYouTube(linkYt);

  const esc = todasEscalas.find(e => e.data === dataFormatada);
  const integrantesCulto = esc ? esc.integrantes : "";

  const registro = {
    data: dataFormatada,
    dia: document.getElementById("input-dia").value,
    ordem: parseInt(document.getElementById("input-ordem").value, 10),
    titulo: tituloExtraido,
    tom: document.getElementById("input-tom").value,
    observacoes: document.getElementById("input-obs").value.trim(),
    link_youtube: linkYt,
    link_cifra: document.getElementById("input-cifra").value.trim(),
    link_letra: document.getElementById("input-letra").value.trim(),
    link_spotify: document.getElementById("input-spotify").value.trim(),
    integrantes: integrantesCulto,
    igreja: CONFIG_IGREJA.codigo,
    igreja_id: CONFIG_IGREJA.id
  };

  try {
    const { error } = await db.from("musicas").insert([registro]);

    if (error) {
      alert("Erro ao gravar louvor: " + error.message);
    } else {
      fecharModalNovoLouvor();
      await carregarRepertorio(true);
    }
  } catch (err) {
    console.error("Erro ao gravar louvor:", err);
    alert("Erro ao gravar louvor.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Guardar no Repertório`;
    if (window.lucide) lucide.createIcons();
  }
}

function abrirModalEditarCulto(dataTexto, diaSemana) {
  document.getElementById("label-culto-edicao").innerText = `${diaSemana} • ${dataTexto}`;
  document.getElementById("modal-editar-culto").classList.remove("hidden");

  const louvoresDesteCulto = todasMusicas.filter(m => parseDataInfo(obterCampo(m, ["data", "date"])).formatada === dataTexto);

  const container = document.getElementById("lista-louvores-culto-edicao");
  if (louvoresDesteCulto.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2">Sem louvores registados para este culto.</p>`;
  } else {
    container.innerHTML = louvoresDesteCulto.map(m => {
      const tit = obterCampo(m, ["titulo", "título", "titulo_final"]) || "Louvor";
      const tom = obterCampo(m, ["tom"]) || "N/D";
      const ord = obterCampo(m, ["ordem", "order"]) ? `#${obterCampo(m, ["ordem", "order"])}` : "";
      const obs = obterCampo(m, ["observacoes", "observacao", "obs", "notas"]) || "";
      const idMusica = m.id;
      const objStr = encodeURIComponent(JSON.stringify(m));

      return `
        <div class="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-xl text-xs gap-2">
          <div class="flex-1 min-w-0">
            <span class="text-slate-100 font-semibold block leading-tight truncate">${ord} ${tit}</span>
            <span class="text-[11px] text-emerald-400 font-medium">Tom: ${tom}</span>
            ${obs ? `<span class="text-[10px] text-amber-300 block truncate">Nota: ${obs}</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="abrirModalEditarLouvorItem('${objStr}')" class="text-indigo-300 hover:text-white p-1.5 bg-indigo-500/10 rounded-lg">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="excluirLouvor(${idMusica})" class="text-rose-400 hover:text-rose-300 p-1.5 bg-rose-500/10 rounded-lg">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
  if (window.lucide) lucide.createIcons();
}

function fecharModalEditarCulto() {
  document.getElementById("modal-editar-culto").classList.add("hidden");
}

function abrirModalEditarLouvorItem(objJsonEncoded) {
  const dados = JSON.parse(decodeURIComponent(objJsonEncoded));
  document.getElementById("edit-id-musica").value = dados.id;
  document.getElementById("edit-data-alvo").value = dados.data;
  document.getElementById("edit-ordem").value = dados.ordem || "1";
  document.getElementById("edit-tom").value = dados.tom || "C";
  document.getElementById("edit-obs").value = dados.observacoes || "";
  document.getElementById("edit-yt").value = dados.link_youtube || "";
  document.getElementById("edit-cifra").value = dados.link_cifra || "";
  document.getElementById("edit-letra").value = dados.link_letra || "";
  document.getElementById("edit-spotify").value = dados.link_spotify || "";

  document.getElementById("modal-editar-louvor-item").classList.remove("hidden");
}

function fecharModalEditarLouvorItem() {
  document.getElementById("modal-editar-louvor-item").classList.add("hidden");
}

async function salvarAlteracaoLouvor(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-edit-louvor");
  btn.disabled = true;
  btn.innerText = "A atualizar...";

  const id = document.getElementById("edit-id-musica").value;
  const linkYt = document.getElementById("edit-yt").value.trim();
  const tituloAtualizado = await buscarTituloYouTube(linkYt);

  const updates = {
    ordem: parseInt(document.getElementById("edit-ordem").value, 10),
    tom: document.getElementById("edit-tom").value,
    observacoes: document.getElementById("edit-obs").value.trim(),
    link_youtube: linkYt,
    titulo: tituloAtualizado,
    link_cifra: document.getElementById("edit-cifra").value.trim(),
    link_letra: document.getElementById("edit-letra").value.trim(),
    link_spotify: document.getElementById("edit-spotify").value.trim()
  };

  const { error } = await db.from("musicas").update(updates).eq("id", id);

  if (error) {
    alert("Erro ao atualizar: " + error.message);
  } else {
    fecharModalEditarLouvorItem();
    fecharModalEditarCulto();
    await carregarRepertorio(true);
  }

  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Atualizar Louvor`;
  if (window.lucide) lucide.createIcons();
}

async function excluirLouvor(id) {
  if (!confirm("Remover este louvor da escala?")) return;

  const { error } = await db.from("musicas").delete().eq("id", id);
  if (error) {
    alert("Erro ao remover: " + error.message);
  } else {
    fecharModalEditarCulto();
    await carregarRepertorio(true);
  }
}

// ==========================================
// GESTÃO DE MEMBROS
// ==========================================
async function abrirModalMembros() {
  document.getElementById("modal-membros").classList.remove("hidden");
  await atualizarListaMembrosAdmin();
}

function fecharModalMembros() {
  document.getElementById("modal-membros").classList.add("hidden");
}

async function atualizarListaMembrosAdmin() {
  const container = document.getElementById("lista-membros-cadastrados");
  try {
    const { data: membros } = await db
      .from("membros")
      .select("id, nome, ativo, primeiro_acesso, is_lider, igreja_id")
      .eq("igreja_id", CONFIG_IGREJA.id)
      .order("nome", { ascending: true });

    dadosCompletosMembros = membros || [];
    todosMembros = dadosCompletosMembros.map(m => m.nome);

    if (dadosCompletosMembros.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 py-2">Nenhum membro registado.</p>`;
      return;
    }

    container.innerHTML = dadosCompletosMembros.map(m => {
      const nomeSanitizado = m.nome.replace(/"/g, '&quot;');
      const statusBadge = m.primeiro_acesso 
        ? `<span class="text-[10px] text-amber-400">1º acesso pendente</span>` 
        : `<span class="text-[10px] text-emerald-400">Ativo</span>`;
      const liderBadge = m.is_lider ? `<span class="text-[10px] text-indigo-400 font-bold ml-1">• Líder</span>` : '';

      return `
        <div class="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-xl text-xs gap-2">
          <div class="flex-1 min-w-0">
            <span class="text-slate-200 font-semibold block truncate">${nomeSanitizado}${liderBadge}</span>
            ${statusBadge}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="redefinirAcessoMembro('${m.id}', '${nomeSanitizado}')" title="Gerar nova palavra-passe e enviar" class="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 active:scale-95 transition flex items-center gap-1">
              <i data-lucide="key-round" class="w-3.5 h-3.5"></i>
              <span>Redefinir</span>
            </button>
            <button onclick="excluirMembro('${nomeSanitizado}')" title="Remover integrante" class="text-rose-400 hover:text-rose-300 p-1.5">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error("Erro ao listar membros:", e);
  }
}

async function redefinirAcessoMembro(id, nome) {
  if (!confirm(`Deseja gerar uma nova palavra-passe provisória para ${nome}?`)) return;

  const novaSenha = gerarSenhaAleatoria();
  const { data, error } = await db.rpc('redefinir_senha_membro_seguro', {
    p_igreja_id: CONFIG_IGREJA.id,
    p_pin_lider: PIN_LIDER_VALIDADO,
    p_membro_id: id,
    p_nova_senha: novaSenha
  });

  if (error || !data || !data.sucesso) {
    alert("Erro ao redefinir credenciais: " + ((data && data.erro) || error?.message));
    return;
  }

  dispararAcessoWhatsApp(nome, novaSenha);
  await atualizarListaMembrosAdmin();
}

async function adicionarNovoMembro(e) {
  e.preventDefault();
  const inputNome = document.getElementById("input-novo-membro-nome");
  const nome = inputNome.value.trim();
  if (!nome) return;

  if (!PIN_LIDER_VALIDADO) {
    alert("Sessão da liderança expirada. Toque no cadeado e digite o PIN novamente.");
    return;
  }

  const btn = document.querySelector("#modal-membros button[type='submit']");
  if (btn) btn.disabled = true;

  const senhaGerada = gerarSenhaAleatoria();

  try {
    const { data, error } = await db.rpc('cadastrar_musico_seguro', {
      p_igreja_id: CONFIG_IGREJA.id,
      p_pin_lider: PIN_LIDER_VALIDADO,
      p_nome: nome,
      p_senha_provisoria: senhaGerada
    });

    if (error || !data || !data.sucesso) {
      alert("Erro ao registar integrante: " + ((data && data.erro) || error?.message));
      return;
    }

    inputNome.value = "";
    await atualizarListaMembrosAdmin();

    if (confirm(`Músico ${nome} registado com sucesso!\nPalavra-passe: ${senhaGerada}\n\nDeseja enviar os dados de acesso por WhatsApp?`)) {
      dispararAcessoWhatsApp(nome, senhaGerada);
    }
  } catch (err) {
    console.error("Erro ao invocar cadastro:", err);
    alert("Erro ao registar integrante.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function excluirMembro(nome) {
  if (!confirm(`Remover ${nome} da equipa de louvor?`)) return;

  const { data, error } = await db.rpc('excluir_musico_seguro', {
    p_igreja_id: CONFIG_IGREJA.id,
    p_pin_lider: PIN_LIDER_VALIDADO,
    p_nome: nome
  });

  if (error || !data || !data.sucesso) {
    alert("Erro ao remover: " + ((data && data.erro) || error?.message));
    return;
  }

  await atualizarListaMembrosAdmin();
}

// ==========================================
// REPERTÓRIO, DATAS E CARDS
// ==========================================
function determinarCultoDestaque() {
  const datasMap = new Map();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  todasMusicas.forEach(m => {
    const info = parseDataInfo(obterCampo(m, ["data", "date"]));
    if (info.dateObj && !datasMap.has(info.chaveOrdenacao)) datasMap.set(info.chaveOrdenacao, info);
  });

  todasEscalas.forEach(esc => {
    const info = parseDataInfo(esc.data);
    if (info.dateObj && !datasMap.has(info.chaveOrdenacao)) datasMap.set(info.chaveOrdenacao, info);
  });

  const datasOrdenadas = Array.from(datasMap.values()).sort((a, b) => a.chaveOrdenacao - b.chaveOrdenacao);
  if (datasOrdenadas.length === 0) return null;

  const proximoOuHoje = datasOrdenadas.find(item => item.dateObj >= hoje);
  let selecionado = proximoOuHoje ? proximoOuHoje : datasOrdenadas[datasOrdenadas.length - 1];
  const ehHoje = selecionado && selecionado.dateObj.getTime() === hoje.getTime();

  const labelProximo = document.getElementById("label-proximo");
  if (labelProximo) {
    labelProximo.innerText = ehHoje ? "Culto de Hoje" : "Próximo Culto";
  }

  dataCultoAlvo = selecionado ? selecionado.formatada : null;

  if (selecionado && selecionado.mesAno) mesAtual = padronizarMesAno(selecionado.mesAno) || selecionado.mesAno;
  return selecionado;
}

function atualizarSeletorMeses() {
  const seletor = document.getElementById("seletor-mes");
  const mesesSet = new Set();

  todasMusicas.forEach(m => {
    const info = parseDataInfo(obterCampo(m, ["data", "date"]));
    const mesValido = padronizarMesAno(info.mesAno);
    if (mesValido) mesesSet.add(mesValido);
  });

  todasEscalas.forEach(esc => {
    const mesValido = padronizarMesAno(esc.mes_ano) || padronizarMesAno(parseDataInfo(esc.data).mesAno);
    if (mesValido) mesesSet.add(mesValido);
  });

  const meses = Array.from(mesesSet).filter(m => /^[A-Za-zÀ-ÿ]+\/\d{4}$/.test(m));

  if (meses.length === 0) {
    seletor.innerHTML = `<option value="TODOS">Todos os Meses</option>`;
    return;
  }

  let options = `<option value="TODOS">Todos os Meses</option>`;
  meses.forEach(m => {
    options += `<option value="${m}" ${m.toLowerCase() === mesAtual.toLowerCase() ? "selected" : ""}>${m}</option>`;
  });

  seletor.innerHTML = options;
  if (!meses.some(m => m.toLowerCase() === mesAtual.toLowerCase())) {
    mesAtual = meses[0];
  }
  seletor.value = mesAtual;
}

function mudarMes(novoMes) {
  mesAtual = padronizarMesAno(novoMes) || novoMes;
  if (diaAtual === "PROXIMO") {
    diaAtual = "TODOS";
  }
  atualizarBotoesFiltrosDinamicos();
  renderizarCards();
}

function carregarDadosIniciais() {
  atualizarInterfaceAdmin();
  const dadosLocais = localStorage.getItem(CACHE_KEY);
  if (dadosLocais) {
    try {
      const parsed = JSON.parse(dadosLocais);
      todasMusicas = parsed.repertorio || [];
      todosMembros = parsed.membros || [];
      todasEscalas = (parsed.escalas || []).map(e => ({ ...e, mes_ano: padronizarMesAno(e.mes_ano) || e.mes_ano }));
      atualizarSeletorMeses();
      atualizarBotoesFiltrosDinamicos();
      determinarCultoDestaque();
      renderizarCards();
    } catch (e) {
      console.error("Erro ao ler cache local:", e);
    }
  }
  verificarSessaoInicial();
}

async function carregarRepertorio(forcado = false) {
  if (!CONFIG_IGREJA.id) return;

  try {
    const [respMusicas, respMembros, respEscalas] = await Promise.all([
      db.from("musicas")
        .select("*")
        .eq("igreja_id", CONFIG_IGREJA.id)
        .order("ordem", { ascending: true }),
      db.from("membros")
        .select("*")
        .eq("igreja_id", CONFIG_IGREJA.id)
        .order("nome", { ascending: true }),
      db.from("escalas")
        .select("*")
        .eq("igreja_id", CONFIG_IGREJA.id)
    ]);

    if (respMusicas.error) console.error("Erro músicas:", respMusicas.error);
    if (respMembros.error) console.error("Erro membros:", respMembros.error);
    if (respEscalas.error) console.error("Erro escalas:", respEscalas.error);

    todasMusicas = respMusicas.data || [];
    dadosCompletosMembros = respMembros.data || [];
    todosMembros = dadosCompletosMembros.map(m => m.nome);
    todasEscalas = (respEscalas.data || []).map(e => ({
      ...e,
      mes_ano: padronizarMesAno(e.mes_ano) || e.mes_ano
    }));

    localStorage.setItem(CACHE_KEY, JSON.stringify({ 
      repertorio: todasMusicas, 
      membros: todosMembros, 
      escalas: todasEscalas 
    }));

    atualizarSeletorMeses();
    atualizarBotoesFiltrosDinamicos();
    determinarCultoDestaque();
    renderizarCards();
  } catch (err) {
    console.error("Erro na comunicação com Supabase:", err);
  } finally {
    if (window.lucide) lucide.createIcons();
  }
}

function atualizarBotoesFiltrosDinamicos() {
  const container = document.getElementById("container-filtros");
  const diasExistentes = new Set();
  const mesAtualNorm = mesAtual.trim().toLowerCase();

  todasEscalas.forEach(e => {
    const info = parseDataInfo(e.data);
    const mesE = (padronizarMesAno(e.mes_ano) || info.mesAno).trim().toLowerCase();
    if (mesAtual === "TODOS" || mesE === mesAtualNorm) {
      if (e.dia) diasExistentes.add(e.dia.trim());
    }
  });

  todasMusicas.forEach(m => {
    const info = parseDataInfo(obterCampo(m, ["data", "date"]));
    const mesM = info.mesAno.trim().toLowerCase();
    if (mesAtual === "TODOS" || mesM === mesAtualNorm) {
      const dia = obterCampo(m, ["dia", "diasemana", "dia_semana"]);
      if (dia) diasExistentes.add(dia.trim());
    }
  });
  
  const ordemSemanal = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  const diasOrdenados = Array.from(diasExistentes).sort((a, b) => {
    const idxA = ordemSemanal.findIndex(d => a.toLowerCase().includes(d.toLowerCase()));
    const idxB = ordemSemanal.findIndex(d => b.toLowerCase().includes(d.toLowerCase()));
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
  
  let html = `
    <button onclick="filtrarDia('PROXIMO')" data-filtro="PROXIMO" class="filtro-btn px-4 py-1.5 rounded-full text-xs font-semibold ${diaAtual === 'PROXIMO' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700/50'} shadow-sm whitespace-nowrap transition flex items-center gap-1.5 shrink-0">
      <i data-lucide="sparkles" class="w-3.5 h-3.5 ${diaAtual === 'PROXIMO' ? 'text-indigo-200' : 'text-slate-400'}"></i>
      <span id="label-proximo">Próximo Culto</span>
    </button>
    <button onclick="filtrarDia('TODOS')" data-filtro="TODOS" class="filtro-btn px-4 py-1.5 rounded-full text-xs font-semibold ${diaAtual === 'TODOS' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700/50'} whitespace-nowrap transition shrink-0">
      Todos
    </button>
  `;
  
  diasOrdenados.forEach(dia => {
    const ativo = diaAtual.toLowerCase() === dia.toLowerCase();
    html += `
      <button onclick="filtrarDia('${dia}')" data-filtro="${dia}" class="filtro-btn px-4 py-1.5 rounded-full text-xs font-semibold ${ativo ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700/50'} whitespace-nowrap transition shrink-0">
        ${dia}s
      </button>
    `;
  });

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function filtrarDia(dia) {
  diaAtual = dia;
  atualizarBotoesFiltrosDinamicos();
  renderizarCards();
}

function renderizarCards() {
  const container = document.getElementById("lista-musicas");
  const mapaGrupos = {};
  const mesAtualNorm = mesAtual.trim().toLowerCase();

  todasEscalas.forEach(esc => {
    const info = parseDataInfo(esc.data);
    const mesEscala = (padronizarMesAno(esc.mes_ano) || info.mesAno).trim().toLowerCase();

    const bateMes = (mesAtual === "TODOS" || mesEscala === mesAtualNorm);
    const bateDia = (diaAtual === "TODOS" || esc.dia.toLowerCase().includes(diaAtual.toLowerCase()));
    const bateProximo = (diaAtual === "PROXIMO" && info.formatada === dataCultoAlvo);

    if ((diaAtual === "PROXIMO" && bateProximo) || (diaAtual !== "PROXIMO" && bateMes && bateDia)) {
      const chave = `${info.formatada} - ${esc.dia}`;
      mapaGrupos[chave] = {
        dataTexto: info.formatada,
        diaSemana: esc.dia,
        ordemData: info.chaveOrdenacao,
        integrantes: esc.integrantes || "",
        itens: []
      };
    }
  });

  const chavesUnicasAdicionadas = new Set();

  todasMusicas.forEach(m => {
    const info = parseDataInfo(obterCampo(m, ["data", "date"]));
    const diaSemana = obterCampo(m, ["dia", "diasemana", "dia_semana"]) || "Culto";
    const mesMusica = info.mesAno.trim().toLowerCase();

    const bateMes = (mesAtual === "TODOS" || mesMusica === mesAtualNorm);
    const bateDia = (diaAtual === "TODOS" || diaSemana.toLowerCase().includes(diaAtual.toLowerCase()));
    const bateProximo = (diaAtual === "PROXIMO" && info.formatada === dataCultoAlvo);

    if ((diaAtual === "PROXIMO" && bateProximo) || (diaAtual !== "PROXIMO" && bateMes && bateDia)) {
      const chave = `${info.formatada} - ${diaSemana}`;
      if (!mapaGrupos[chave]) {
        mapaGrupos[chave] = {
          dataTexto: info.formatada,
          diaSemana: diaSemana,
          ordemData: info.chaveOrdenacao,
          integrantes: obterCampo(m, ["integrantes", "escala", "equipe"]) || "",
          itens: []
        };
      }
      if (!mapaGrupos[chave].integrantes) {
        mapaGrupos[chave].integrantes = obterCampo(m, ["integrantes", "escala", "equipe"]) || "";
      }

      const linkYT = obterCampo(m, ["linkyoutube", "link_youtube", "youtube"]) || "";
      const ordem = obterCampo(m, ["ordem", "order"]) || "";
      const chaveItem = `${m.id || info.formatada + '_' + ordem + '_' + linkYT}`;

      if (!chavesUnicasAdicionadas.has(chaveItem)) {
        chavesUnicasAdicionadas.add(chaveItem);
        mapaGrupos[chave].itens.push(m);
      }
    }
  });

  const gruposOrdenados = Object.values(mapaGrupos).sort((a, b) => a.ordemData - b.ordemData);

  if (gruposOrdenados.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 px-4 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
        <i data-lucide="calendar-x" class="w-8 h-8 text-slate-600 mx-auto mb-2"></i>
        <p class="text-slate-400 text-sm font-medium">Nenhum culto programado</p>
        <p class="text-slate-600 text-xs mt-0.5">${isAdmin ? "Utilize o botão 'Escalar' para agendar um culto." : "Aguarde a publicação da liderança."}</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = gruposOrdenados.map(grupo => {
    grupo.itens.sort((a, b) => {
      const ordA = parseInt(obterCampo(a, ["ordem", "order"]) || 99, 10);
      const ordB = parseInt(obterCampo(b, ["ordem", "order"]) || 99, 10);
      return ordA - ordB;
    });

    let cardsHtml = "";
    if (grupo.itens.length === 0) {
      cardsHtml = `
        <div class="col-span-full py-8 px-4 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-center">
          <i data-lucide="music" class="w-6 h-6 text-slate-600 mx-auto mb-2"></i>
          <p class="text-xs text-slate-400 font-medium">Escala definida, a aguardar louvores do culto.</p>
        </div>
      `;
    } else {
      cardsHtml = grupo.itens.map(m => {
        const titulo = obterCampo(m, ["titulo", "título", "titulo_final", "title"]) || "Louvor sem título";
        const tom = obterCampo(m, ["tom", "tonalidade"]) || "N/D";
        const ordem = obterCampo(m, ["ordem", "order"]) ? `#${obterCampo(m, ["ordem", "order"])}` : "";
        const obs = obterCampo(m, ["observacoes", "observacao", "obs", "notas"]);

        const linkYT = obterCampo(m, ["linkyoutube", "link_youtube", "youtube", "youtube_url_final"]);
        const linkCifra = obterCampo(m, ["linkcifra", "link_cifra", "cifra"]);
        const linkLetra = obterCampo(m, ["linkletra", "link_letra", "letra"]);
        const linkSpotify = obterCampo(m, ["linkspotify", "link_spotify", "spotify"]);

        const ytId = extrairYouTubeId(linkYT) || m.youtube_id;
        const thumb = ytId
          ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
          : "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80";

        const blocoObsHtml = obs ? `
          <div class="mt-2.5 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300/90 px-2.5 py-1.5 rounded-xl text-xs font-medium">
            <i data-lucide="info" class="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5"></i>
            <span class="leading-snug break-words">${obs}</span>
          </div>
        ` : '';

        return `
          <div class="bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-lg hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div class="relative aspect-video w-full bg-slate-950">
                <img src="${thumb}" alt="${titulo}" class="w-full h-full object-cover opacity-90" loading="lazy" />

                ${linkYT ? `
                  <a href="${linkYT}" target="_blank" rel="noopener noreferrer" 
                     class="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/20 transition group">
                    <div class="w-12 h-12 rounded-lg bg-red-600 text-white flex items-center justify-center shadow-lg transition transform group-hover:scale-110 active:scale-95">
                      <i data-lucide="play" class="w-5 h-5 fill-current ml-0.5"></i>
                    </div>
                  </a>
                ` : ''}

                <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  ${ordem ? `
                    <span class="bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
                      ${ordem}
                    </span>
                  ` : ''}
                </div>

                <div class="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-lg text-xs font-bold shadow">
                  Tom: ${tom}
                </div>
              </div>

              <div class="p-4">
                <h2 class="font-semibold text-slate-100 text-sm sm:text-base leading-snug line-clamp-2">
                  ${titulo}
                </h2>
                ${blocoObsHtml}
              </div>
            </div>

            <div class="px-4 pb-4">
              <div class="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80">
                ${linkCifra ? `
                  <a href="${linkCifra}" target="_blank" rel="noopener noreferrer" 
                     class="flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold active:scale-95 transition">
                    <i data-lucide="music" class="w-3.5 h-3.5 text-amber-400"></i>
                    <span>Cifra</span>
                  </a>
                ` : `
                  <div class="flex items-center justify-center py-2 px-1 rounded-xl bg-slate-950/40 border border-slate-800/50 text-slate-600 text-xs font-medium">
                    Sem Cifra
                  </div>
                `}

                ${linkLetra ? `
                  <a href="${linkLetra}" target="_blank" rel="noopener noreferrer" 
                     class="flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold active:scale-95 transition">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 text-sky-400"></i>
                    <span>Letra</span>
                  </a>
                ` : `
                  <div class="flex items-center justify-center py-2 px-1 rounded-xl bg-slate-950/40 border border-slate-800/50 text-slate-600 text-xs font-medium">
                    Sem Letra
                  </div>
                `}

                ${linkSpotify ? `
                  <a href="${linkSpotify}" target="_blank" rel="noopener noreferrer" 
                     class="flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl bg-slate-800/90 border border-emerald-500/30 hover:bg-emerald-950/30 text-emerald-300 text-xs font-semibold active:scale-95 transition">
                    <img src="assets/Spotify.png" alt="Spotify" class="w-4 h-4 object-contain" />
                    <span class="text-white">Spotify</span>
                  </a>
                ` : `
                  <div class="flex items-center justify-center py-2 px-1 rounded-xl bg-slate-950/40 border border-slate-800/50 text-slate-600 text-xs font-medium">
                    Sem Áudio
                  </div>
                `}
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    const botoesLiderancaCulto = isAdmin ? `
      <div class="flex items-center gap-1.5">
        ${grupo.itens.length > 0 ? `
          <button onclick="abrirModalEditarCulto('${grupo.dataTexto}', '${grupo.diaSemana}')" class="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 transition active:scale-95">
            <i data-lucide="edit-3" class="w-3 h-3"></i>
            Louvores
          </button>
        ` : ''}
        <button onclick="abrirModalEditarEquipeDia('${grupo.dataTexto}', '${grupo.diaSemana}')" class="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 transition active:scale-95">
          <i data-lucide="users" class="w-3.5 h-3.5"></i>
          Equipe
        </button>
        <button onclick="enviarLembreteCultoWhatsApp('${grupo.dataTexto}', '${grupo.diaSemana}')" title="Avisar ensaio no grupo do WhatsApp" class="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/30 hover:bg-emerald-900/50 active:scale-95 transition flex items-center justify-center shrink-0">
          <img src="assets/whatsapp.png" alt="WhatsApp" class="w-4 h-4 object-contain" />
        </button>
      </div>
    ` : '';

    const escalaHtml = grupo.integrantes ? `
      <div class="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3.5 flex items-start gap-3 shadow-md">
        <div class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400">
          <i data-lucide="users" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">Escala de Músicos</span>
          <p class="text-xs text-slate-200 leading-relaxed font-medium">${grupo.integrantes}</p>
        </div>
      </div>
    ` : '';

    return `
      <section class="space-y-3 pt-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <div class="bg-indigo-950/70 border border-indigo-500/30 text-indigo-300 px-3.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-sm truncate">
              ${grupo.diaSemana} • ${grupo.dataTexto}
            </div>
            <div class="h-px bg-slate-800 flex-1"></div>
          </div>
          ${botoesLiderancaCulto}
        </div>
        ${escalaHtml}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${cardsHtml}
        </div>
      </section>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

// ==========================================
// CICLO DE VIDA E INICIALIZAÇÃO
// ==========================================
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") carregarRepertorio(false);
});

setInterval(() => carregarRepertorio(false), 30000);

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }
  carregarDadosIniciais();
});