// Financ.co: mapa vivo do mês (com física), calendário, cartões, contas a pagar e linha do tempo de 12 meses.
// Regra de data: gasto no cartão conta no mês em que a fatura vence; parcelado divide pelos meses seguintes.
// Regra de pagamento: fatura, gasto que repete e gasto marcado "ainda não paguei" ficam em A pagar até serem marcados como pagos.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const CX = 500, CY = 260;
const BRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rico = v => `${v < 0 ? '−' : ''}<span class="moeda">R$</span>${NUM(Math.abs(v))}`;   // o R$ fica menor que o número
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ic = n => `<svg class="ic" viewBox="0 0 256 256" aria-hidden="true"><path d="${ICONES[n] || ''}"/></svg>`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const CATS = {
  gasto: ['Moradia', 'Mercado', 'Transporte', 'Lazer', 'Saúde', 'Assinaturas', 'Compras', 'Dívida', 'Outros'],
  ganho: ['Salário', 'Extra', 'Outros'],
};
const ICO = {
  gasto: { Moradia: 'house', Mercado: 'shopping-cart', Transporte: 'car', Lazer: 'confetti', 'Saúde': 'first-aid-kit', Assinaturas: 'television-simple', Compras: 'handbag', 'Dívida': 'receipt', Outros: 'dots-three-outline' },
  ganho: { 'Salário': 'briefcase', Extra: 'lightning', Outros: 'coins' },
};
const cor = () => 'var(--texto)';   // uma tinta só: categoria se distingue pelo ícone e pelo nome
const icone = (tipo, cat) => (ICO[tipo] || {})[cat] || 'dots-three-outline';
const selo = (tipo, cat, extra = '') => `<i class="selo ${extra}" style="--c:${cor(tipo, cat)}">${ic(icone(tipo, cat))}</i>`;

const idx = (y, m) => y * 12 + m;
const dataDe = (i, dia = 1) => new Date(Math.floor(i / 12), i % 12, dia);
const diasNoMes = i => new Date(Math.floor(i / 12), i % 12 + 1, 0).getDate();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = s => new Date(s + 'T12:00');
const nomeMes = i => dataDe(i).toLocaleDateString('pt-BR', { month: 'long' });
let hoje, MES_HOJE, HOJE_ISO;
function acertarHoje() { hoje = new Date(); MES_HOJE = idx(hoje.getFullYear(), hoje.getMonth()); HOJE_ISO = iso(hoje); }
acertarHoje();

const vazio = () => ({ v: 2, cartoes: [], lancs: [], memoria: {}, pagos: {} });
let S = vazio();
let sel = MES_HOJE, tipo = 'gasto', preso = null, foco = null, diaAberto = null, editando = null;
let vista = 'vMapa', painel = 'cats';

// ---------- aviso (com desfazer) ----------
let toastT = 0;
function toast(msg, acao, fn, fixo) {
  const t = $('#toast'), b = t.querySelector('button');
  t.querySelector('span').textContent = msg;
  b.hidden = !acao; b.textContent = acao || ''; b.onclick = () => { t.classList.remove('vis'); fn && fn(); };
  t.classList.add('vis'); clearTimeout(toastT);
  if (!fixo) toastT = setTimeout(() => t.classList.remove('vis'), 7000);
}
addEventListener('error', e => toast('Algo deu errado: ' + e.message));
addEventListener('unhandledrejection', e => toast('Algo deu errado: ' + (e.reason && e.reason.message || e.reason)));

// ---------- dados ----------
// Só grava no arquivo quando a leitura veio do arquivo e deu certo: assim uma abertura lenta ou um arquivo
// ilegível nunca é sobrescrito por uma tela vazia.
let fonte = null, travado = false, fila = Promise.resolve(), prontoApi;
const esperaApi = new Promise(ok => { prontoApi = ok; });
const temApi = () => !!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.carregar === 'function');
addEventListener('pywebviewready', () => { prontoApi(); if (fonte === 'local') ler().then(() => { limparMemo(); tudo(); }); });

function aplicar(t) {
  if (!t) return;
  const d = JSON.parse(t);
  if (!d || typeof d !== 'object' || !Array.isArray(d.lancs) || !Array.isArray(d.cartoes)) throw new Error('formato desconhecido');
  S = Object.assign(vazio(), d);
  let mexeu = false;   // arquivo da versão anterior: guarda o dia em que cada lançamento passou a existir
  for (const l of S.lancs) if (!l.criado) { l.criado = HOJE_ISO; mexeu = true; }
  if (S.v !== 2) { S.v = 2; mexeu = true; }
  if (mexeu) salvar();
}
async function ler() {
  fonte = temApi() ? 'api' : 'local'; travado = false;
  try { aplicar(fonte === 'api' ? await window.pywebview.api.carregar() : localStorage.getItem('financeiro')); }
  catch (e) {
    travado = true; S = vazio(); console.error(e);
    let onde = '';
    try { if (fonte === 'api') onde = await window.pywebview.api.guardar_ilegivel(); } catch (_) { }
    toast('Não consegui ler o arquivo de dados. Nada será gravado por cima dele.' + (onde ? ' Guardei uma cópia em dados/copias.' : ''), null, null, true);
  }
}
async function carregar() {
  if (!temApi()) await Promise.race([esperaApi, new Promise(ok => setTimeout(ok, 1500))]);
  await ler();
}
function salvar() {
  if (travado) return;
  const t = JSON.stringify(S), falhou = e => { console.error(e); toast('Não consegui gravar. Seus dados continuam na tela, mas feche o app só depois de tentar de novo.', 'Tentar de novo', salvar, true); };
  if (fonte === 'api') fila = fila.then(() => window.pywebview.api.salvar(t)).catch(falhou);   // uma gravação por vez, na ordem
  else try { localStorage.setItem('financeiro', t); } catch (e) { falhou(e); }
}
const memo = new Map(), memoR = new Map(); let memoP = null;
function limparMemo() { memo.clear(); memoR.clear(); memoP = null; }
function mudou() { limparMemo(); salvar(); }
// Qualquer mudança que apaga ou marca algo pode ser desfeita pelo aviso.
function desfazivel(msg, fn) {
  const antes = JSON.stringify(S);
  fn(); mudou(); tudo(); if (dlg.open) desenharDoDia();
  toast(msg, 'Desfazer', () => { S = JSON.parse(antes); mudou(); tudo(); if (dlg.open) desenharDoDia(); });
}
const cartaoDe = l => l.cartao && S.cartoes.find(c => c.id === l.cartao) || null;   // inclui cartão removido: as compras dele continuam valendo
const cartoesAtivos = () => S.cartoes.filter(c => !c.arquivado);

// O que cada lançamento pesa no mês i, em que dia, e se já foi pago.
function itensDoMes(i) {
  if (memo.has(i)) return memo.get(i);
  const out = [], nd = diasNoMes(i);
  for (const l of S.lancs) {
    const d = deIso(l.data), c = cartaoDe(l);
    let m0 = idx(d.getFullYear(), d.getMonth());
    if (c) {
      if (d.getDate() > c.fecha) m0++;   // comprou depois do fechamento: cai na próxima fatura
      if (c.vence <= c.fecha) m0++;      // fatura vence no mês seguinte ao fechamento
    }
    const dia = Math.min(nd, c ? c.vence : d.getDate());
    let it = null;
    if (l.fixo) { if (i >= m0) it = { valor: l.valor, rot: 'todo mês' }; }
    else {
      const n = Math.max(1, l.parcelas || 1), k = i - m0;
      if (k >= 0 && k < n) {   // em centavos; a sobra da divisão vai na última parcela
        const cent = Math.round(l.valor * 100), base = Math.floor(cent / n);
        it = { valor: (k === n - 1 ? cent - base * (n - 1) : base) / 100, rot: n > 1 ? `${k + 1}/${n}` : '' };
      }
    }
    if (!it) continue;
    Object.assign(it, { l, c, dia, i, venc: iso(dataDe(i, dia)), rastreia: false, pago: true, atrasado: false });
    if (l.tipo === 'gasto') {
      it.chave = c ? `f:${c.id}@${i}` : `${l.id}@${i}`;   // compras do cartão compartilham a chave da fatura
      it.rastreia = !!(c || l.fixo || l.pendente);
      const marcado = S.pagos[it.chave];
      // sem marcação: o que venceu antes de o lançamento existir conta como pago; o resto fica pendente
      it.pago = marcado !== undefined ? marcado : (c || l.fixo) ? it.venc < (l.criado || HOJE_ISO) : !l.pendente;
      it.atrasado = !it.pago && it.venc < HOJE_ISO;
    }
    out.push(it);
  }
  memo.set(i, out); return out;
}
function resumo(i) {
  if (memoR.has(i)) return memoR.get(i);
  const m = new Map(); let G = 0, D = 0;
  for (const it of itensDoMes(i)) {
    const k = it.l.tipo + ':' + it.l.cat;
    const n = m.get(k) || { k, tipo: it.l.tipo, cat: it.l.cat, valor: 0, cor: cor(it.l.tipo, it.l.cat) };
    n.valor += it.valor; m.set(k, n);
    it.l.tipo === 'ganho' ? G += it.valor : D += it.valor;
  }
  const r = { nos: [...m.values()], G, D }; memoR.set(i, r); return r;
}
// Junta as compras do cartão numa fatura só; o resto vira uma conta por lançamento.
function contasDe(its) {
  const m = new Map();
  for (const it of its) {
    if (!it.rastreia) continue;
    let o = m.get(it.chave);
    if (!o) m.set(it.chave, o = { chave: it.chave, i: it.i, venc: it.venc, valor: 0, pago: true, c: it.c, l: it.l, rot: it.rot });
    o.valor += it.valor; if (!it.pago) o.pago = false;
  }
  return [...m.values()];
}
// Tudo que está sem pagar: o atrasado de qualquer mês (fica até ser pago) e o que vence até o fim do mês que vem.
function pendencias() {
  if (memoP) return memoP;
  let de = MES_HOJE;
  for (const l of S.lancs) { const d = deIso(l.data); de = Math.min(de, idx(d.getFullYear(), d.getMonth())); }
  const atrasadas = [], aVencer = [];
  for (let i = Math.max(de, MES_HOJE - 120); i <= MES_HOJE + 1; i++)
    for (const o of contasDe(itensDoMes(i))) if (!o.pago) (o.venc < HOJE_ISO ? atrasadas : aVencer).push(o);
  const porData = (a, b) => a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0;
  return memoP = { atrasadas: atrasadas.sort(porData), aVencer: aVencer.sort(porData) };
}
function quando(venc) {
  const n = Math.round((deIso(HOJE_ISO) - deIso(venc)) / 864e5), dia = deIso(venc).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  if (n > 1) return `venceu há ${n} dias, em ${dia}`;
  if (n === 1) return `venceu ontem, ${dia}`;
  if (n === 0) return 'vence hoje';
  if (n === -1) return `vence amanhã, ${dia}`;
  return `vence em ${-n} dias, ${dia}`;
}

// ---------- utilidades de tela ----------
function conta(el, to, fmt) {
  const de = el._v || 0, por = v => fmt ? el.innerHTML = fmt(v) : el.textContent = BRL(v);
  el._v = to; cancelAnimationFrame(el._r);
  if (reduz || de === to || document.hidden) { por(to); return; }
  const t0 = performance.now();
  (function f(t) {
    const p = Math.max(0, Math.min(1, (t - t0) / 600)), e = 1 - Math.pow(1 - p, 3);
    por(p < 1 ? de + (to - de) * e : to);
    if (p < 1) el._r = requestAnimationFrame(f);
  })(t0);
}
// Mantém os mesmos elementos entre atualizações, para as transições funcionarem.
function chaveado(box, itens, criar, atualizar) {
  const m = box._m || (box._m = new Map()), vistos = new Set();
  for (const it of itens) {
    let el = m.get(it.k);
    if (!el) { el = criar(it); m.set(it.k, el); box.appendChild(el); el.getBoundingClientRect(); }
    vistos.add(it.k); atualizar(el, it);
  }
  for (const [k, el] of m) if (!vistos.has(k)) { el.remove(); m.delete(k); }
  const quer = itens.map(it => m.get(it.k));
  if (quer.some((el, i) => box.children[i] !== el)) quer.forEach(el => box.appendChild(el));
}
const teclaBotao = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };

// ---------- mapa (física de mola: tudo que se toca, mexe) ----------
const svg = $('#svg'), gElos = $('#elos'), gNos = $('#nos'), gParts = $('#parts'), gCentro = $('#centro');
const mk = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
const els = new Map(), parts = new Map(), fis = new Map();
const centro = { x: CX, y: CY, vx: 0, vy: 0 };
let atual = new Map(), arrasto = null, ult = 0, rodando = false;

const mola = (o, tx, ty, dt) => { o.vx += (110 * (tx - o.x) - 13 * o.vx) * dt; o.vy += (110 * (ty - o.y) - 13 * o.vy) * dt; o.x += o.vx * dt; o.y += o.vy * dt; };
const caminho = (ax, ay, bx, by) => { const dx = (bx - ax) * .5; return `M${ax} ${ay} C${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`; };
function ponto(ax, ay, bx, by, t) {
  const dx = (bx - ax) * .5, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * ax + b * (ax + dx) + c * (bx - dx) + d * bx, a * ay + b * ay + c * by + d * by];
}
const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
const pegar = (e, o, k) => { arrasto = { o, k, moveu: false, x0: e.clientX, y0: e.clientY }; svg.setPointerCapture(e.pointerId); };

function rajada(k, n = 10) {
  const no = atual.get(k); if (!no || reduz || !rodando) return;
  const arr = parts.get(k) || [];
  for (let q = 0; q < n; q++) { const el = mk('circle', { r: 2.2 }, gParts); el.style.fill = no.cor; arr.push({ t: -q * .06, v: .9, unico: true, el }); }
  parts.set(k, arr);
}
function onda() {
  if (reduz) return;
  const c = mk('circle', { class: 'onda', r: 70 }, gCentro);
  c.addEventListener('animationend', () => c.remove());
}
function setFoco(k) {
  foco = k; svg.classList.toggle('temFoco', !!k);
  for (const [q, e] of els) { e.g.classList.toggle('foco', q === k); e.p.classList.toggle('foco', q === k); }
}
function prender(k) {
  preso = preso === k ? null : k;
  for (const [q, e] of els) e.g.classList.toggle('preso', q === preso);
  $$('.cats li').forEach(li => li.classList.toggle('preso', li._k === preso));
  if (preso) { rajada(preso, 8); irPainel('lancs'); }
  desenharLista();
}

function desenharMapa(res, estouro) {
  const { nos, G, D } = res, max = Math.max(1, ...nos.map(n => n.valor));
  let topo = CY - 60;
  const lados = [['ganho', $('#rotE'), G, 210], ['gasto', $('#rotS'), D, 790]];
  for (const l of lados) {
    const ls = l[4] = nos.filter(n => n.tipo === l[0]).sort((a, b) => b.valor - a.valor);
    const vao = Math.min(120, 440 / Math.max(1, ls.length));
    ls.forEach((n, j) => {
      n.tx = l[3];
      n.ty = CY + 14 + (j - (ls.length - 1) / 2) * vao;
      n.tr = Math.min(vao * .42, 15 + 30 * Math.sqrt(n.valor / max));
    });
    if (ls.length) topo = Math.min(topo, ls[0].ty - ls[0].tr);
  }
  // os títulos das duas colunas ficam na mesma altura, logo acima da bolha mais alta, com o total de cada lado
  for (const [, rot, total, x, ls] of lados) {
    rot.classList.toggle('some', !ls.length);
    rot.style.transform = `translate(${x}px, ${Math.max(34, topo - 20)}px)`;
    rot.querySelector('.n').textContent = BRL(total);
  }
  const mapa = new Map(nos.map(n => [n.k, n]));

  for (const n of nos) {
    let e = els.get(n.k);
    if (!e) {
      e = { p: mk('path', { class: 'elo' }, gElos), g: mk('g', { class: 'no', tabindex: 0, role: 'button' }, gNos) };
      e.c = mk('circle', { r: 0 }, e.g);
      e.i = mk('svg', { viewBox: '0 0 256 256' }, e.g);
      mk('path', { d: ICONES[icone(n.tipo, n.cat)] || '', fill: 'currentColor' }, e.i);
      e.t = mk('g', {}, e.g);
      e.nome = mk('text', { class: 'nome', y: -2 }, e.t);
      e.val = mk('text', { class: 'val mono', y: 15 }, e.t);
      e.g.addEventListener('pointerenter', () => !arrasto && setFoco(n.k));
      e.g.addEventListener('pointerleave', () => !arrasto && setFoco(null));
      e.g.addEventListener('focus', () => setFoco(n.k));
      e.g.addEventListener('blur', () => setFoco(null));
      e.g.addEventListener('keydown', teclaBotao(() => prender(n.k)));
      e.g.addEventListener('pointerdown', ev => pegar(ev, fis.get(n.k), n.k));
      els.set(n.k, e);
      fis.set(n.k, { x: centro.x, y: centro.y, vx: 0, vy: 0, r: 0, vr: 0, fase: Math.random() * 6.28 });   // nasce no centro
    }
    const esq = n.tipo === 'ganho';
    e.g.setAttribute('aria-label', `${n.cat}, ${BRL(n.valor)}. Enter mostra só os lançamentos desta categoria.`);
    e.nome.setAttribute('text-anchor', esq ? 'end' : 'start');
    e.val.setAttribute('text-anchor', esq ? 'end' : 'start');
    e.nome.textContent = n.cat; conta(e.val, n.valor);
    e.p.style.strokeWidth = (1 + 15 * n.valor / max) + 'px';
    e.g.classList.toggle('preso', n.k === preso);

    // partículas: quanto maior o valor, mais dinheiro correndo
    const arr = parts.get(n.k) || [], fixas = arr.filter(p => !p.unico);
    const quer = reduz ? 0 : 1 + Math.round(3 * n.valor / max);
    for (let q = fixas.length; q < quer; q++) { const el = mk('circle', { r: 1.6 }, gParts); el.style.fill = n.cor; arr.push({ t: Math.random(), v: .18 + Math.random() * .1, el }); }
    for (let q = fixas.length; q > quer; q--) { const p = fixas[q - 1]; p.el.remove(); arr.splice(arr.indexOf(p), 1); }
    parts.set(n.k, arr);
  }
  for (const [k, e] of els) if (!mapa.has(k)) {
    e.g.classList.add('sai'); e.p.classList.add('sai'); els.delete(k); fis.delete(k);
    (parts.get(k) || []).forEach(p => p.el.remove()); parts.delete(k);
    setTimeout(() => { e.g.remove(); e.p.remove(); }, 350);
  }
  atual = mapa;
  if (preso && !mapa.has(preso)) preso = null;

  gCentro.classList.toggle('neg', G - D < 0);
  conta($('#cVal'), G - D, v => {   // o número encolhe para caber no círculo
    const t = (v < 0 ? '−' : '') + 'R$ ' + NUM(Math.abs(v));
    $('#cVal').style.fontSize = t.length > 13 ? '14px' : t.length > 11 ? '16px' : '19px';
    return t;
  });
  if (estouro) { rajada(estouro); onda(); }
  const semNada = !S.lancs.length;
  $('#vazio').classList.toggle('some', nos.length > 0);
  $('#vazioTxt').textContent = semNada ? 'Registre o primeiro ganho ou gasto e o mapa se monta.' : `Nada registrado em ${nomeMes(sel)}.`;
  $('#btExemplo').hidden = !semNada;
}

// O laço só roda com o mapa na tela e a janela visível.
function ligar() { if (!rodando && vista === 'vMapa' && !document.hidden) { rodando = true; ult = 0; requestAnimationFrame(quadro); } }
function quadro(ts) {
  if (vista !== 'vMapa' || document.hidden) { rodando = false; return; }
  const dt = ult ? Math.min(.033, (ts - ult) / 1000) : .016, t = ts / 1000; ult = ts;
  if (!arrasto || arrasto.o !== centro) { if (reduz) { centro.x = CX; centro.y = CY; } else mola(centro, CX, CY, dt); }
  gCentro.setAttribute('transform', `translate(${centro.x} ${centro.y})`);
  for (const [k, n] of atual) {
    const f = fis.get(k), e = els.get(k); if (!f || !e) continue;
    const livre = !arrasto || arrasto.o !== f, alvoR = n.tr * (foco === k ? 1.14 : 1);
    if (reduz) { if (livre) { f.x = n.tx; f.y = n.ty; } f.r = alvoR; }
    else {
      if (livre) mola(f, n.tx + Math.sin(t * .7 + f.fase) * 3, n.ty + Math.cos(t * .6 + f.fase) * 3, dt);   // respira de leve
      f.vr += (160 * (alvoR - f.r) - 14 * f.vr) * dt; f.r = Math.max(0, f.r + f.vr * dt);
    }
    const s = f.r * .9, esq = n.tipo === 'ganho';
    e.g.setAttribute('transform', `translate(${f.x} ${f.y})`);
    e.c.setAttribute('r', f.r);
    e.i.setAttribute('x', -s / 2); e.i.setAttribute('y', -s / 2); e.i.setAttribute('width', s); e.i.setAttribute('height', s);
    e.t.setAttribute('transform', `translate(${esq ? -(f.r + 12) : f.r + 12} 0)`);
    e.p.setAttribute('d', caminho(f.x, f.y, centro.x, centro.y));
    const arr = parts.get(k) || [], vel = foco === k ? 2.5 : 1;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i]; p.t += dt * p.v * vel;
      if (p.t >= 1) { if (p.unico) { p.el.remove(); arr.splice(i, 1); continue; } p.t -= 1; }
      if (p.t < 0) { p.el.style.opacity = 0; continue; }
      const [x, y] = ponto(f.x, f.y, centro.x, centro.y, esq ? p.t : 1 - p.t);   // ganho vai ao centro; gasto sai dele
      p.el.setAttribute('cx', x); p.el.setAttribute('cy', y);
      p.el.style.opacity = Math.sin(Math.PI * p.t) * (p.unico ? .9 : .55);
    }
  }
  requestAnimationFrame(quadro);
}

gCentro.addEventListener('pointerdown', e => pegar(e, centro, null));
svg.addEventListener('pointermove', e => {
  if (!arrasto) return;
  if (Math.hypot(e.clientX - arrasto.x0, e.clientY - arrasto.y0) > 4) arrasto.moveu = true;
  if (!arrasto.moveu) return;
  const p = pt(e), o = arrasto.o;
  o.vx = (p.x - o.x) * 14; o.vy = (p.y - o.y) * 14;   // guarda o embalo para o soltar
  o.x = p.x; o.y = p.y;
});
const soltar = () => { if (!arrasto) return; const a = arrasto; arrasto = null; if (!a.moveu) { if (a.k) prender(a.k); else { onda(); for (const k of atual.keys()) rajada(k, 6); } } };
svg.addEventListener('pointerup', soltar);
svg.addEventListener('pointercancel', soltar);

// ---------- lateral ----------
function desenharLado({ nos, G, D }) {
  const sobra = G - D, base = Math.max(G, D) || 1;
  conta($('#totS'), sobra, rico); conta($('#totG'), G, rico); conta($('#totD'), D, rico);
  $('#totS').classList.toggle('sai', sobra < 0);
  const gastos = nos.filter(n => n.tipo === 'gasto').sort((a, b) => b.valor - a.valor);
  const ganhos = nos.filter(n => n.tipo === 'ganho').sort((a, b) => b.valor - a.valor);

  const segs = gastos.map((n, i) => ({ k: n.k, pct: n.valor / base * 100, n, o: Math.max(.3, 1 - i * .12) }));   // do maior (tinta cheia) ao menor (mais claro)
  if (sobra > 0) segs.push({ k: 'resto', pct: sobra / base * 100 });
  chaveado($('#barra'), segs, () => document.createElement('i'), (el, s) => {
    el.style.flexGrow = s.pct; el.style.opacity = s.o || 1; el.className = s.n ? '' : 'resto'; el._s = s;
  });
  $('#barra').classList.toggle('vazia', !segs.length);
  const p = $('#usoTxt');
  p._padrao = G > 0
    ? (D > G ? `Os gastos passaram do que entrou em <b class="mono">${BRL(D - G)}</b>` : `<b>${Math.round(D / G * 100)}%</b> do que entrou já tem destino`)
    : (D > 0 ? 'Nenhum ganho registrado neste mês' : 'Nada registrado neste mês');
  p.innerHTML = p._padrao;

  for (const [box, lista, total, nada] of [[$('#catsD'), gastos, D, 'Nenhum gasto neste mês.'], [$('#catsG'), ganhos, G, 'Nenhum ganho neste mês.']]) {
    const mx = Math.max(1, ...lista.map(n => n.valor));
    box.dataset.nada = nada; box.classList.toggle('semItens', !lista.length);
    chaveado(box, lista, n => {
      const li = document.createElement('li'); li._k = n.k; li.tabIndex = 0; li.setAttribute('role', 'button');
      li.innerHTML = `${selo(n.tipo, n.cat)}<div><div class="nm"><span>${esc(n.cat)}</span><small class="mono"></small></div><i class="tr"></i></div><span class="v"></span>`;
      li.onclick = () => prender(n.k);
      li.onkeydown = teclaBotao(() => prender(n.k));
      li.onmouseenter = () => setFoco(n.k); li.onmouseleave = () => setFoco(null);
      return li;
    }, (li, n) => {
      li.querySelector('small').textContent = Math.round(n.valor / (total || 1) * 100) + '%';
      const tr = li.querySelector('.tr'); tr.style.transform = `scaleX(${n.valor / mx})`; tr.style.background = n.cor;
      conta(li.querySelector('.v'), n.valor);
      li.classList.toggle('preso', n.k === preso);
    });
  }
}
$('#barra').addEventListener('mouseover', e => { const s = e.target._s; if (s) $('#usoTxt').innerHTML = s.n ? `${esc(s.n.cat)} <b class="mono">${BRL(s.n.valor)}</b>` : 'O que ainda sobra'; });
$('#barra').addEventListener('mouseleave', () => { $('#usoTxt').innerHTML = $('#usoTxt')._padrao; });

function irPainel(p) {
  painel = p;
  $$('#seg button').forEach(b => { const a = b.dataset.painel === p; b.classList.toggle('ativo', a); b.setAttribute('aria-selected', a); });
  $('#seg').dataset.em = p;
  $('#pCats').classList.toggle('ativo', p === 'cats'); $('#pLancs').classList.toggle('ativo', p === 'lancs'); $('#pPagar').classList.toggle('ativo', p === 'pagar');
}
$$('#seg button').forEach(b => b.onclick = () => irPainel(b.dataset.painel));

const rotDia = dia => dataDe(sel, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' });
// Uma linha de lançamento: clicar abre para editar; a bolinha marca como pago quando a conta é acompanhada.
function linhaLanc(it, i) {
  const g = it.l.tipo === 'ganho', fat = !!it.c;
  const tags = [it.rot, fat && 'cartão ' + it.c.nome, it.atrasado && 'atrasado'].filter(Boolean).join(', ');
  const rotSt = it.pago ? (fat ? 'Fatura paga. Clique para desmarcar' : 'Pago. Clique para desmarcar') : (fat ? 'Marcar a fatura como paga' : 'Marcar como pago');
  const st = it.rastreia
    ? `<button class="st ${it.pago ? 'pago' : ''}" type="button" data-pg="${it.chave}" data-pago="${it.pago ? 1 : 0}" title="${rotSt}" aria-label="${rotSt}: ${esc(it.l.desc)}">${ic(it.pago ? 'check-circle' : 'circle')}</button>`
    : '<span></span>';
  return `<li class="lanc ${it.atrasado ? 'atras' : ''}" style="--i:${i}">${selo(it.l.tipo, it.l.cat)}` +
    `<button class="d" type="button" data-ed="${it.l.id}" title="Editar"><span>${esc(it.l.desc)}</span><small>${esc(tags)}</small></button>` +
    `<span class="v ${g ? 'entra' : ''}">${g ? '+' : '−'} ${BRL(it.valor)}</span>${st}</li>`;
}
function desenharLista() {
  let its = itensDoMes(sel).slice().sort((a, b) => b.dia - a.dia);
  if (preso) its = its.filter(it => it.l.tipo + ':' + it.l.cat === preso);
  $('#listaTitulo').textContent = preso ? preso.split(':')[1] + ' em ' + nomeMes(sel) : 'Lançamentos de ' + nomeMes(sel);
  $('#btLimpa').hidden = !preso;
  let h = '', ultimo = null, i = 0;
  for (const it of its) {
    if (it.dia !== ultimo) { ultimo = it.dia; h += `<li class="diaT">${rotDia(it.dia)}</li>`; }
    h += linhaLanc(it, i++);
  }
  $('#lista').innerHTML = h || '<li class="nada">Nada neste mês.</li>';
}
$('#btLimpa').onclick = () => prender(preso);

// ---------- a pagar ----------
function linhaConta(o) {
  const nome = o.c ? 'Fatura ' + o.c.nome : o.l.desc, atras = o.venc < HOJE_ISO;
  const sub = [quando(o.venc), !o.c && o.rot && o.rot !== 'todo mês' && o.rot].filter(Boolean).join(', ');
  return `<li class="conta ${atras ? 'atras' : ''}">${o.c ? `<i class="selo" style="--c:var(--fraco)">${ic('credit-card')}</i>` : selo('gasto', o.l.cat)}` +
    `<button class="d" type="button" data-mes="${o.i}" title="Ir para ${nomeMes(o.i)}"><span>${esc(nome)}</span><small>${esc(sub)}</small></button>` +
    `<span class="v">${BRL(o.valor)}</span>` +
    `<button class="pg" type="button" data-pg="${o.chave}" data-pago="0" title="Marcar como pago" aria-label="Marcar ${esc(nome)} como pago">${ic('check')}</button></li>`;
}
function desenharPagar() {
  const { atrasadas, aVencer } = pendencias(), soma = l => l.reduce((s, o) => s + o.valor, 0);
  let h = '';
  if (atrasadas.length) h += `<h3 class="titFiltro atras"><span>Atrasadas</span><b class="mono">${BRL(soma(atrasadas))}</b></h3><ul class="contas">${atrasadas.map(linhaConta).join('')}</ul>`;
  if (aVencer.length) h += `<h3 class="titFiltro"><span>A vencer</span><b class="mono">${BRL(soma(aVencer))}</b></h3><ul class="contas">${aVencer.map(linhaConta).join('')}</ul>`;
  $('#pagar').innerHTML = h || '<p class="nada">Nenhuma conta pendente.</p><p class="ajuda">Faturas de cartão, gastos que repetem todo mês e gastos marcados como "ainda não paguei" aparecem aqui até você marcar como pagos.</p>';
  const n = atrasadas.length, b = $('#segN'), a = $('#alerta');
  b.hidden = !n; b.textContent = n;
  a.hidden = !n;
  if (n) a.innerHTML = `${ic('warning-circle')}<span>${plural(n, 'conta atrasada', 'contas atrasadas')}</span><b class="mono">${BRL(soma(atrasadas))}</b>`;
}
$('#alerta').onclick = () => irPainel('pagar');
// marcar como pago ou desmarcar, em qualquer lugar da tela
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pg]'); if (!b) return;
  const pago = b.dataset.pago === '1', ch = b.dataset.pg;
  desfazivel(pago ? 'Voltou para A pagar' : 'Marcado como pago', () => { S.pagos[ch] = !pago; });
});
$('#pagar').addEventListener('click', e => { const b = e.target.closest('[data-mes]'); if (b) ir(+b.dataset.mes); });

// ---------- calendário ----------
let calDe = null;
function desenharCal(animar) {
  const nd = diasNoMes(sel), por = new Map();
  const dia = n => por.get(n) || por.set(n, { its: [], compras: [], g: 0, d: 0, atras: false }).get(n);
  for (const it of itensDoMes(sel)) { const o = dia(it.dia); o.its.push(it); if (it.atrasado) o.atras = true; it.l.tipo === 'ganho' ? o.g += it.valor : o.d += it.valor; }
  for (const l of S.lancs) { const d = deIso(l.data); if (cartaoDe(l) && idx(d.getFullYear(), d.getMonth()) === sel) dia(Math.min(nd, d.getDate())).compras.push(l); }
  const mx = Math.max(1, ...[...por.values()].map(o => Math.abs(o.g - o.d)));
  let h = '<i></i>'.repeat(dataDe(sel).getDay());
  for (let n = 1; n <= nd; n++) {
    const o = por.get(n) || { its: [], compras: [], g: 0, d: 0 }, s = o.g - o.d, tem = o.its.length || o.compras.length;
    const todos = [...o.its.map(it => selo(it.l.tipo, it.l.cat)), ...o.compras.map(l => selo(l.tipo, l.cat, 'oca'))];
    const selos = todos.slice(0, 5).map((x, i) => x.replace('style="', `style="--i:${i};`)).join('') + (todos.length > 5 ? `<span class="mais">+${todos.length - 5}</span>` : '');
    const cls = [sel === MES_HOJE && n === hoje.getDate() ? 'hoje' : '', s > 0 ? 'pos' : s < 0 ? 'neg' : '', tem ? '' : 'livre', o.atras ? 'atras' : ''].join(' ');
    const fala = `Dia ${n}` + (o.g || o.d ? `, saldo ${BRL(s)}` : '') + (o.atras ? ', com conta atrasada' : '');
    h += `<button type="button" class="dia ${cls}" data-dia="${n}" style="--q:${(Math.abs(s) / mx).toFixed(2)};--n:${n}" aria-label="${fala}">` +
      `<span class="n">${n}</span>${o.atras ? `<span class="pino" title="Conta atrasada"></span>` : ''}<span class="add">${ic('plus')}</span><span class="selos">${selos}</span>` +
      `<span class="tot ${s > 0 ? 'pos' : ''}">${o.g || o.d ? (s < 0 ? '−' : '+') + ' ' + NUM(Math.abs(s)) : ''}</span></button>`;
  }
  const g = $('#grade'); g.innerHTML = h;
  if (animar || calDe !== sel) { g.classList.remove('anima'); void g.offsetWidth; g.classList.add('anima'); }
  calDe = sel;
}
$('#grade').addEventListener('animationend', e => { if (e.target.dataset.dia == diasNoMes(sel)) $('#grade').classList.remove('anima'); });
$('#grade').onclick = e => { const b = e.target.closest('.dia'); if (b) abrir(+b.dataset.dia, e); };

// ---------- cartões ----------
function desenharTiles() {
  const its = itensDoMes(sel), ativos = cartoesAtivos();
  const h = ativos.map((c, i) => {
    const meus = its.filter(it => it.c === c), total = meus.reduce((s, it) => s + it.valor, 0);
    const melhor = c.fecha >= 31 ? 1 : c.fecha + 1;
    let st = '';
    if (meus.length) {
      const paga = meus.every(it => it.pago), atras = meus.some(it => it.atrasado), ch = meus[0].chave;
      st = `<div class="sit ${paga ? 'paga' : atras ? 'atras' : ''}"><span>${ic(paga ? 'check-circle' : atras ? 'warning-circle' : 'clock')}${paga ? 'Fatura paga' : 'Em aberto, ' + quando(meus[0].venc)}</span>` +
        `<button class="mini" type="button" data-pg="${ch}" data-pago="${paga ? 1 : 0}">${paga ? 'Desmarcar' : 'Marcar como paga'}</button></div>`;
    }
    return `<article class="tile" style="animation-delay:${i * 60}ms"><header><b>${ic('credit-card')}${esc(c.nome)}</b><button class="ico" type="button" data-cid="${c.id}" title="Remover cartão" aria-label="Remover ${esc(c.nome)}">${ic('trash')}</button></header>` +
      `<div class="fat"><small>Fatura de ${nomeMes(sel)}</small><strong>${rico(total)}</strong><small>${plural(meus.length, 'lançamento', 'lançamentos')}</small></div>${st}` +
      `<dl><div><dt>Fecha</dt><dd>dia ${c.fecha}</dd></div><div><dt>Vence</dt><dd>dia ${c.vence}</dd></div>` +
      `<div class="larga"><dt>Melhor dia para comprar</dt><dd>dia ${melhor}<small>Logo depois do fechamento você ganha o maior prazo para pagar.</small></dd></div></dl></article>`;
  }).join('');
  // o formulário de cartão novo é criado uma vez só, para não perder o que estiver digitado
  const t = $('#tiles'), form = $('#tileNovo') || Object.assign(document.createElement('article'), {
    id: 'tileNovo', className: 'tile novo', innerHTML: `<form id="formCartao" autocomplete="off">
    <label class="campo"><span>Nome do cartão</span><input name="nome" required maxlength="30"></label>
    <label class="campo"><span>Dia em que a fatura fecha</span><input name="fecha" type="number" min="1" max="31" required><small>Compras depois desse dia vão para a fatura seguinte.</small></label>
    <label class="campo"><span>Dia do vencimento</span><input name="vence" type="number" min="1" max="31" required><small>O dia em que você paga a fatura.</small></label>
    <button class="btn cheio" type="submit">${ic('plus')}Adicionar cartão</button></form>` });
  form.remove(); t.innerHTML = h; t.appendChild(form);
}
function encherFormas() {
  const f = $('#fForma'), antes = f.value;
  f.innerHTML = '<option value="">Conta ou dinheiro</option>' + cartoesAtivos().map(c => `<option value="${c.id}">Cartão ${esc(c.nome)}</option>`).join('');
  f.value = cartoesAtivos().some(c => c.id === antes) ? antes : '';
}
const tiles = $('#tiles');
tiles.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  S.cartoes.push({ id: novoId(), nome: f.nome.value.trim(), fecha: +f.fecha.value, vence: +f.vence.value });
  f.reset(); mudou(); tudo();
});
tiles.addEventListener('click', e => {
  const b = e.target.closest('[data-cid]'); if (!b) return;
  const c = S.cartoes.find(c => c.id === b.dataset.cid), usado = S.lancs.some(l => l.cartao === c.id);
  // cartão com compras é só escondido: as compras continuam nas faturas dele
  desfazivel(usado ? 'Cartão removido. As compras dele continuam nas faturas.' : 'Cartão removido', () => { if (usado) c.arquivado = true; else S.cartoes = S.cartoes.filter(x => x !== c); });
});

// ---------- linha do tempo ----------
let j0 = null;   // primeiro mês da janela de 12; anda junto quando o mês escolhido sai dela
function desenharLinha() {
  if (j0 === null) j0 = MES_HOJE - 3;
  if (sel < j0) j0 = sel; if (sel > j0 + 11) j0 = sel - 11;
  const ms = [];
  for (let i = j0; i <= j0 + 11; i++) { const r = resumo(i); ms.push({ k: i, i, g: r.G, d: r.D }); }
  const mx = Math.max(1, ...ms.map(m => Math.max(m.g, m.d)));
  chaveado($('#linha'), ms, m => {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'col'; c.dataset.i = m.i;
    c.innerHTML = '<div class="cima"><i class="b"></i></div><div class="baixo"><i class="b"></i></div><span class="mes"></span><span class="net mono"></span>';
    const d = dataDe(m.i), curto = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    c.querySelector('.mes').innerHTML = esc(curto) + (d.getMonth() === 0 ? ` <small>${String(d.getFullYear()).slice(2)}</small>` : '');
    return c;
  }, (c, m) => {
    c.classList.toggle('sel', m.i === sel);
    c.classList.toggle('hoje', m.i === MES_HOJE);
    c.classList.toggle('futuro', m.i > MES_HOJE);
    c.classList.toggle('semDado', !m.g && !m.d);
    c.querySelector('.cima .b').style.transform = `scaleY(${m.g / mx})`;
    c.querySelector('.baixo .b').style.transform = `scaleY(${m.d / mx})`;
    const net = c.querySelector('.net'), s = m.g - m.d;
    net.textContent = m.g || m.d ? (s < 0 ? '−' : '+') + Math.abs(Math.round(s)).toLocaleString('pt-BR') : '';
    net.classList.toggle('neg', s < 0);
    c.setAttribute('aria-label', `${nomeMes(m.i)} de ${dataDe(m.i).getFullYear()}: entrou ${BRL(m.g)}, saiu ${BRL(m.d)}`);
    c.setAttribute('aria-current', m.i === sel ? 'true' : 'false');
    c.title = `Entrou ${BRL(m.g)}, saiu ${BRL(m.d)}`;
  });
}
function ir(i) { if (i === sel) return; sel = i; preso = null; tudo(); }
// clicar ou arrastar pela linha troca de mês
const irPara = el => { const c = el && el.closest('.col'); if (c) ir(+c.dataset.i); };
let varrendo = false;
$('#linha').addEventListener('pointerdown', e => { varrendo = true; irPara(e.target); });
addEventListener('pointerup', () => { varrendo = false; });
$('#linha').addEventListener('pointermove', e => { if (varrendo) irPara(document.elementFromPoint(e.clientX, e.clientY)); });
$('#linha').addEventListener('click', e => irPara(e.target));
$('#btAnt').onclick = () => ir(sel - 1);
$('#btProx').onclick = () => ir(sel + 1);
$('#btHoje').onclick = () => { j0 = MES_HOJE - 3; ir(MES_HOJE); };

// ---------- abas ----------
const ORDEM = ['vMapa', 'vCal', 'vCartoes'];
function moverInd() { const b = $('.abas .ativo'), i = $('.abas .ind'); i.style.width = b.offsetWidth + 'px'; i.style.transform = `translateX(${b.offsetLeft}px)`; }
function irVista(id) {
  const a = ORDEM.indexOf(id); if (a < 0) return;
  vista = id;
  ORDEM.forEach((v, i) => { const el = $('#' + v); el.style.setProperty('--lado', i < a ? -1 : 1); el.classList.toggle('ativa', i === a); el.inert = i !== a; });
  $$('.abas button').forEach(b => { const at = b.dataset.vista === id; b.classList.toggle('ativo', at); b.setAttribute('aria-selected', at); });
  moverInd();
  if (id === 'vCal') desenharCal(true);
  if (id === 'vCartoes') desenharTiles();
  ligar();
}
$$('.abas button').forEach(b => b.onclick = () => irVista(b.dataset.vista));
addEventListener('resize', moverInd);

// ---------- janela de registro (novo e edição) ----------
const dlg = $('#dlg');
function lerValor(s) {   // aceita 1.234,56, 1234,56, 12.50 e 1.234; recusa o resto
  s = String(s).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(parseFloat(s) * 100) / 100 : NaN;
}
function ajustarForm() {
  const c = $('#fCat');
  if (c._tipo !== tipo) { c._tipo = tipo; c.innerHTML = CATS[tipo].map(x => `<option>${x}</option>`).join(''); }
  const gasto = tipo === 'gasto', cartao = gasto && !!$('#fForma').value, fixo = $('#fFixo').checked;
  $('#linhaForma').hidden = !gasto;
  $('#fParc').disabled = !cartao || fixo;
  if ($('#fParc').disabled) $('#fParc').value = '1';
  $('#linhaPend').hidden = !gasto || cartao || fixo;
  $('#dicaPagar').hidden = !gasto || !(cartao || fixo);
  $('#troca').classList.toggle('ganho', !gasto);
  $$('#troca button').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === tipo));
}
function desenharDoDia() {
  if (!diaAberto) { $('#doDia').innerHTML = ''; return; }
  $('#doDia').innerHTML = itensDoMes(sel).filter(it => it.dia === diaAberto).map(linhaLanc).join('');
}
function erro(campo, msg, tem) { msg.hidden = !tem; campo.setAttribute('aria-invalid', tem ? 'true' : 'false'); }
function preencher(id) {
  const l = id && S.lancs.find(x => x.id === id);
  editando = l ? l.id : null;
  $('#dlgTitulo').textContent = l ? 'Editar lançamento' : diaAberto ? rotDia(diaAberto) + ' de ' + nomeMes(sel) : 'Novo lançamento';
  $('#btSalvar').textContent = l ? 'Salvar' : 'Registrar';
  $('#btExcluir').hidden = !l;
  erro($('#fValor'), $('#erroValor'), false); erro($('#fDesc'), $('#erroDesc'), false);
  encherFormas();
  if (l) {
    tipo = l.tipo; ajustarForm();
    $('#fValor').value = NUM(l.valor); $('#fDesc').value = l.desc; $('#fCat').value = l.cat; $('#fData').value = l.data;
    const f = $('#fForma'), c = cartaoDe(l);
    if (c && c.arquivado) f.insertAdjacentHTML('beforeend', `<option value="${c.id}">Cartão ${esc(c.nome)} (removido)</option>`);
    f.value = c ? c.id : '';
    $('#fFixo').checked = !!l.fixo; $('#fPend').checked = !!l.pendente;
    ajustarForm(); $('#fParc').value = String(l.parcelas || 1);
  } else {
    $('#fValor').value = ''; $('#fDesc').value = ''; $('#fFixo').checked = false; $('#fParc').value = '1';
    $('#fData').value = iso(diaAberto ? dataDe(sel, diaAberto) : sel === MES_HOJE ? hoje : dataDe(sel));
    $('#fPend')._mexeu = false; $('#fPend').checked = $('#fData').value > HOJE_ISO;   // data no futuro: é uma conta que ainda vai ser paga
    ajustarForm();
  }
}
function abrir(dia, ev, id) {
  diaAberto = dia || null;
  desenharDoDia(); preencher(id);
  if (!dlg.open) dlg.showModal();
  $('#fValor').focus(); if (id) $('#fValor').select();
}
$('#btNovo').onclick = e => abrir(null, e);
$('#dlgFechar').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
// clicar num lançamento (lateral ou janela do dia) abre para editar
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ed]'); if (!b) return;
  if (dlg.open) { preencher(b.dataset.ed); $('#fValor').focus(); $('#fValor').select(); } else abrir(null, e, b.dataset.ed);
});
addEventListener('keydown', e => {
  if (dlg.open || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); abrir(); }
  if (e.key === 'ArrowLeft') ir(sel - 1);
  if (e.key === 'ArrowRight') ir(sel + 1);
});

$$('#troca button').forEach(b => b.onclick = () => { tipo = b.dataset.tipo; ajustarForm(); $('#fValor').focus(); });
$('#fForma').onchange = ajustarForm;
$('#fFixo').onchange = ajustarForm;
$('#fPend').onchange = e => { e.target._mexeu = true; };
$('#fData').onchange = e => { const p = $('#fPend'); if (!editando && !p._mexeu) p.checked = e.target.value > HOJE_ISO; };
$('#fValor').oninput = () => erro($('#fValor'), $('#erroValor'), false);
$('#fDesc').oninput = e => {   // lembra a categoria usada da última vez para este nome
  erro($('#fDesc'), $('#erroDesc'), false);
  const m = S.memoria[tipo + ':' + e.target.value.trim().toLowerCase()];
  if (m && CATS[tipo].includes(m)) $('#fCat').value = m;
};
$('#form').onsubmit = e => {
  e.preventDefault();
  const valor = lerValor($('#fValor').value), desc = $('#fDesc').value.trim();
  const ruimV = !(valor > 0), ruimD = !desc;
  erro($('#fValor'), $('#erroValor'), ruimV); erro($('#fDesc'), $('#erroDesc'), ruimD);
  if (ruimV) { const c = $('#caixaValor'); c.classList.remove('treme'); void c.offsetWidth; c.classList.add('treme'); $('#fValor').focus(); return; }
  if (ruimD) { $('#fDesc').focus(); return; }
  const cat = $('#fCat').value, forma = tipo === 'gasto' && $('#fForma').value, fixo = $('#fFixo').checked;
  const novo = { tipo, valor, desc, cat, data: $('#fData').value || HOJE_ISO, fixo };
  if (forma) { novo.cartao = forma; novo.parcelas = +$('#fParc').value || 1; }
  else if (tipo === 'gasto' && !fixo && $('#fPend').checked) novo.pendente = true;
  let l = editando && S.lancs.find(x => x.id === editando);
  if (l) { delete l.cartao; delete l.parcelas; delete l.pendente; Object.assign(l, novo); }
  else { l = { id: novoId(), criado: HOJE_ISO, ...novo }; S.lancs.push(l); }
  S.memoria[tipo + ':' + desc.toLowerCase()] = cat;
  mudou(); dlg.close();
  // pula para o mês em que o lançamento pesa, para a pessoa ver o efeito
  const d = deIso(l.data), i0 = idx(d.getFullYear(), d.getMonth());
  if (!itensDoMes(sel).some(it => it.l === l)) for (let i = i0; i <= i0 + 2; i++) if (itensDoMes(i).some(it => it.l === l)) { sel = i; break; }
  preso = null; tudo(tipo + ':' + cat);
};
$('#btExcluir').onclick = () => {
  const id = editando; if (!id) return;
  dlg.close();
  desfazivel('Lançamento apagado', () => {
    S.lancs = S.lancs.filter(l => l.id !== id);
    for (const k of Object.keys(S.pagos)) if (k.startsWith(id + '@')) delete S.pagos[k];
  });
};

// ---------- tema: tela preta ou branca ----------
// A escolha fica junto dos dados; sem escolha, segue o tema do Windows.
const temaDoSistema = matchMedia('(prefers-color-scheme: light)');
function aplicarTema() {
  const t = S.tema || (temaDoSistema.matches ? 'claro' : 'escuro');
  if (document.documentElement.dataset.tema === t && aplicarTema.feito === fonte) return;
  aplicarTema.feito = fonte;
  document.documentElement.dataset.tema = t;
  if (fonte === 'api' && window.pywebview.api.tema) window.pywebview.api.tema(t).catch(() => { });   // a barra da janela acompanha
  $('#btTema').innerHTML = ic(t === 'claro' ? 'moon' : 'sun');
}
$('#btTema').onclick = () => { S.tema = document.documentElement.dataset.tema === 'claro' ? 'escuro' : 'claro'; aplicarTema(); salvar(); };
temaDoSistema.addEventListener('change', aplicarTema);

// ---------- menu, exemplo ----------
function exemplo() {
  const d = n => iso(new Date(hoje.getFullYear(), hoje.getMonth(), n));
  const cartao = { id: novoId(), nome: 'Roxo', fecha: 3, vence: 10, exemplo: true };
  const L = (tipo, valor, desc, cat, dia, extra) => ({ id: novoId(), criado: HOJE_ISO, exemplo: true, tipo, valor, desc, cat, data: d(dia), fixo: false, ...extra });
  S.cartoes.push(cartao);
  S.lancs.push(
    L('ganho', 4200, 'Salário', 'Salário', 5, { fixo: true }), L('ganho', 600, 'Freela', 'Extra', 8),
    L('gasto', 1300, 'Aluguel', 'Moradia', 5, { fixo: true }), L('gasto', 650, 'Mercado', 'Mercado', 6),
    L('gasto', 220, 'Combustível', 'Transporte', 4), L('gasto', 180, 'Cinema e bar', 'Lazer', 7),
    L('gasto', 90, 'Streaming', 'Assinaturas', 2, { fixo: true }), L('gasto', 400, 'Parcela da dívida', 'Dívida', 9, { fixo: true }),
    L('gasto', 3600, 'Notebook', 'Compras', 2, { cartao: cartao.id, parcelas: 10 }),
  );
  mudou(); tudo();
}
$('#btExemplo').onclick = exemplo;
$('#btExemploMenu').onclick = () => { $('#menu').hidePopover(); exemplo(); };
$('#btLimpaEx').onclick = () => { $('#menu').hidePopover(); limparExemplo(); };
const limparExemplo = () => desfazivel('Dados de exemplo removidos', () => {
  const ids = new Set(S.lancs.filter(l => l.exemplo).map(l => l.id));
  S.lancs = S.lancs.filter(l => !l.exemplo); S.cartoes = S.cartoes.filter(c => !c.exemplo || S.lancs.some(l => l.cartao === c.id));
  for (const k of Object.keys(S.pagos)) if (ids.has(k.split('@')[0])) delete S.pagos[k];
});
$('#btApagar').onclick = () => { $('#menu').hidePopover(); desfazivel('Todos os dados foram apagados', () => { const tema = S.tema; S = vazio(); if (tema) S.tema = tema; preso = null; }); };

function titulo() {
  $('#btHoje').hidden = sel === MES_HOJE;
  const h = $('#mesTitulo'); if (h._m === sel) return; h._m = sel;
  h.firstElementChild.textContent = nomeMes(sel); h.lastElementChild.textContent = dataDe(sel).getFullYear();
  h.classList.remove('virou'); void h.offsetWidth; h.classList.add('virou');
}
function tudo(estouro) {
  aplicarTema();
  const res = resumo(sel);
  desenharMapa(res, estouro); desenharLado(res); desenharLinha(); desenharLista(); desenharPagar(); titulo();
  if (vista === 'vCal') desenharCal();          // as abas escondidas são desenhadas só quando abrem
  if (vista === 'vCartoes') desenharTiles();
  $('#btLimpaEx').hidden = !S.lancs.some(l => l.exemplo);
  $('#btExemploMenu').hidden = S.lancs.length > 0;
}
// virou o dia com o app aberto: refaz as contas de atraso e, se estava no mês atual, acompanha
function conferirDia() {
  ligar();
  if (iso(new Date()) === HOJE_ISO) return;
  const noAtual = sel === MES_HOJE; acertarHoje(); if (noAtual) sel = MES_HOJE;
  limparMemo(); tudo();
}
document.addEventListener('visibilitychange', conferirDia);
addEventListener('focus', conferirDia);

// ---------- início ----------
setTimeout(() => document.body.classList.add('pronto'), 3000);   // se algo travar na abertura, a tela aparece mesmo assim
(async () => {
  $$('[data-ic]').forEach(e => e.insertAdjacentHTML('afterbegin', ic(e.dataset.ic)));
  $('#fParc').innerHTML = Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('');
  await carregar();
  const q = new URLSearchParams(location.search);
  if (q.has('demo') && !S.lancs.length) exemplo();
  if (q.get('mes')) sel = MES_HOJE + (+q.get('mes') || 0);
  tudo(); ajustarForm(); irPainel(q.get('painel') || 'cats');
  irVista(q.get('vista') || 'vMapa');
  if (q.has('novo')) abrir();
  document.fonts.ready.then(moverInd);
  document.body.classList.add('pronto');
})();
